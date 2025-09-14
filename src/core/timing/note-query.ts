// Pure note query & mapping utilities
// Operate on the Zustand timeline store state shape (tracks + midiCache) without side effects.
// All time domain inputs/outputs are in timeline seconds or ticks as documented.

import type { TimelineState, TimelineTrack } from '@state/timelineStore';
import type { TempoMapEntry } from './types';
import { beatsToSeconds, secondsToBeats } from './tempo-utils';
import { CANONICAL_PPQ } from './ppq';

export interface NoteQueryResult {
    trackId: string;
    note: number;
    channel: number;
    startSec: number;
    endSec: number;
    velocity: number;
    duration: number;
}

function getSecondsPerBeatFallback(state: TimelineState): number {
    return 60 / (state.timeline.globalBpm || 120);
}

function resolveTempoMap(state: TimelineState, track?: { tempoMap?: TempoMapEntry[] }) {
    return track?.tempoMap ?? state.timeline.masterTempoMap;
}

function trackOffsetSeconds(state: TimelineState, track: TimelineTrack): number {
    const spb = getSecondsPerBeatFallback(state);
    const beats = (track.offsetTicks || 0) / CANONICAL_PPQ;
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spb);
}

// Map timeline seconds -> track local seconds accounting for offset & (future) regions
export function timelineToTrackSeconds(state: TimelineState, track: TimelineTrack, timelineSec: number): number | null {
    const local = timelineSec - trackOffsetSeconds(state, track);
    if (track.regionStartTick != null || track.regionEndTick != null) {
        // Derive region bounds in seconds lazily
        const spb = getSecondsPerBeatFallback(state);
        const startBeats = (track.regionStartTick ?? 0) / CANONICAL_PPQ;
        const endBeats = (track.regionEndTick ?? track.regionStartTick ?? 0) / CANONICAL_PPQ;
        const startSec = beatsToSeconds(state.timeline.masterTempoMap, startBeats, spb);
        const endSec = beatsToSeconds(state.timeline.masterTempoMap, endBeats, spb);
        if (local < startSec || local > endSec) return null;
    }
    return Math.max(0, local);
}

// Convert track-local beats to absolute timeline seconds
export function trackBeatsToTimelineSeconds(state: TimelineState, track: TimelineTrack, beats: number): number {
    const spb = getSecondsPerBeatFallback(state);
    const map = resolveTempoMap(state, track as any);
    const secLocal = beatsToSeconds(map, beats, spb);
    return secLocal + trackOffsetSeconds(state, track);
}

// Convert timeline seconds to track-local beats
export function timelineSecondsToTrackBeats(state: TimelineState, track: TimelineTrack, timelineSec: number): number {
    const spb = getSecondsPerBeatFallback(state);
    const map = resolveTempoMap(state, track as any);
    const local = timelineSec - trackOffsetSeconds(state, track);
    return secondsToBeats(map, local, spb);
}

// Core window query: gather notes overlapping [startSec,endSec) timeline seconds
export function getNotesInWindow(
    state: TimelineState,
    trackIds: string[],
    startSec: number,
    endSec: number
): NoteQueryResult[] {
    if (!(endSec > startSec)) return [];
    const out: NoteQueryResult[] = [];
    const spbFallback = getSecondsPerBeatFallback(state);

    // Determine candidate ids: if empty -> all tracks
    const allTrackIds = Object.keys(state.tracks);
    let candidates = trackIds && trackIds.length ? trackIds.slice() : allTrackIds;
    // Filter to existing midi tracks only
    candidates = candidates.filter((id) => {
        const t = state.tracks[id];
        return t && t.type === 'midi';
    });
    // Solo logic: if any candidate tracks are soloed, restrict to soloed
    const soloed = candidates.filter((id) => state.tracks[id]?.solo);
    if (soloed.length > 0) candidates = soloed;

    for (const id of candidates) {
        const track = state.tracks[id];
        if (!track || track.type !== 'midi' || !track.enabled || track.mute) continue;
        const cacheKey = track.midiSourceId ?? id;
        const cache = state.midiCache[cacheKey];
        if (!cache) continue;
        const map = cache.tempoMap ?? state.timeline.masterTempoMap;
        const offsetSec = trackOffsetSeconds(state, track);

        // Compute local query window (track seconds)
        let loLocal = startSec - offsetSec;
        let hiLocal = endSec - offsetSec;
        // Region clipping (region ticks define allowed local range)
        if (track.regionStartTick != null || track.regionEndTick != null) {
            const regionStartBeats = (track.regionStartTick ?? 0) / CANONICAL_PPQ;
            const regionEndBeats = (track.regionEndTick ?? track.regionStartTick ?? 0) / CANONICAL_PPQ;
            const regionStartSec = beatsToSeconds(state.timeline.masterTempoMap, regionStartBeats, spbFallback);
            const regionEndSec = beatsToSeconds(state.timeline.masterTempoMap, regionEndBeats, spbFallback);
            if (loLocal < regionStartSec) loLocal = regionStartSec;
            if (hiLocal > regionEndSec) hiLocal = regionEndSec;
        }
        if (!(hiLocal > loLocal)) continue;

        for (const n of cache.notesRaw) {
            // Derive note local seconds from beats (preferred) or ticks fallback
            let startBeats: number | undefined = n.startBeat;
            let endBeats: number | undefined = n.endBeat;
            if (startBeats == null) startBeats = n.startTick / CANONICAL_PPQ;
            if (endBeats == null) endBeats = n.endTick / CANONICAL_PPQ;
            const sLocal = beatsToSeconds(map, startBeats, spbFallback);
            const eLocal = beatsToSeconds(map, endBeats, spbFallback);
            // Window overlap test in local domain
            if (!(eLocal >= loLocal && sLocal <= hiLocal)) continue;
            const absStart = sLocal + offsetSec;
            const absEnd = eLocal + offsetSec;
            if (!(absEnd >= startSec && absStart <= endSec)) continue;
            out.push({
                trackId: id,
                note: n.note,
                channel: n.channel || 0,
                startSec: absStart,
                endSec: absEnd,
                velocity: n.velocity ?? 0,
                duration: Math.max(0, absEnd - absStart),
            });
        }
    }
    out.sort((a, b) => a.startSec - b.startSec);
    return out;
}

// Convenience: get notes near a given center point within N bars (uses beatsPerBar + fallback spb)
export function getNotesNearTimeUnit(
    state: TimelineState,
    trackId: string,
    centerSec: number,
    bars: number = 1
): NoteQueryResult[] {
    const track = state.tracks[trackId];
    if (!track) return [];
    const bpb = state.timeline.beatsPerBar || 4;
    const map = state.timeline.masterTempoMap;
    const spb = getSecondsPerBeatFallback(state);
    const beats = timelineSecondsToTrackBeats(state, track, centerSec);
    const barIndex = Math.floor(beats / bpb);
    const windowStartBeats = Math.floor(barIndex / bars) * bars * bpb;
    const windowEndBeats = windowStartBeats + bars * bpb;
    const startSec = trackBeatsToTimelineSeconds(state, track, windowStartBeats);
    const endSec = trackBeatsToTimelineSeconds(state, track, windowEndBeats);
    return getNotesInWindow(state, [trackId], startSec, endSec);
}

export const noteQueryApi = {
    timelineToTrackSeconds,
    trackBeatsToTimelineSeconds,
    timelineSecondsToTrackBeats,
    getNotesInWindow,
    getNotesNearTimeUnit,
};

export default noteQueryApi;
