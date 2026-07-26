// Pure note query & mapping utilities
// Operate on the Zustand timeline store state shape (tracks + midiCache) without side effects.
// All time domain inputs/outputs are in timeline seconds or ticks as documented.

import type { TimelineState, TimelineTrack } from '@state/timelineStore';
import type { TempoMapEntry } from './types';
import { beatsToSeconds, secondsToBeats } from './tempo-utils';
import { CANONICAL_PPQ } from './ppq';
import { getMidiClipTimelineBounds, getMidiClipsForTrack, getPrimaryMidiClip, type MidiClip } from '@state/timeline/midiClips';

export interface NoteQueryResult {
    trackId: string;
    clipId?: string;
    sourceId?: string;
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

function clipOffsetSeconds(state: TimelineState, clip: MidiClip): number {
    const spb = getSecondsPerBeatFallback(state);
    const beats = (clip.offsetTicks || 0) / CANONICAL_PPQ;
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spb);
}

function trackOffsetSeconds(state: TimelineState, track: TimelineTrack): number {
    const clip = getPrimaryMidiClip(track);
    if (clip) return clipOffsetSeconds(state, clip);
    const spb = getSecondsPerBeatFallback(state);
    const beats = (track.offsetTicks || 0) / CANONICAL_PPQ;
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spb);
}

// Map timeline seconds -> track local seconds accounting for offset & (future) regions
export function timelineToTrackSeconds(state: TimelineState, track: TimelineTrack, timelineSec: number): number | null {
    const clip = getPrimaryMidiClip(track);
    const local = timelineSec - (clip ? clipOffsetSeconds(state, clip) : trackOffsetSeconds(state, track));
    const regionStartTick = clip?.regionStartTick ?? track.regionStartTick;
    const regionEndTick = clip?.regionEndTick ?? track.regionEndTick;
    if (regionStartTick != null || regionEndTick != null) {
        // Derive region bounds in seconds lazily
        const spb = getSecondsPerBeatFallback(state);
        const startBeats = (regionStartTick ?? 0) / CANONICAL_PPQ;
        const endBeats = (regionEndTick ?? regionStartTick ?? 0) / CANONICAL_PPQ;
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
        for (const clip of getMidiClipsForTrack(track)) {
            if (clip.enabled === false) continue;
            const clipBounds = getMidiClipTimelineBounds(state.midiCache, clip);
            if (clipBounds) {
                const clipStartSec = beatsToSeconds(state.timeline.masterTempoMap, clipBounds.startTick / CANONICAL_PPQ, spbFallback);
                const clipEndSec = beatsToSeconds(state.timeline.masterTempoMap, clipBounds.endTick / CANONICAL_PPQ, spbFallback);
                if (clipEndSec <= startSec || clipStartSec >= endSec) continue;
            }
            const cache = state.midiCache[clip.sourceId];
            if (!cache) continue;
            // Imported MIDI tempo is source metadata. Once the file is placed on
            // the timeline, note timing must follow the timeline's tempo map (or
            // global BPM fallback), just like transport and audio playback.
            // Otherwise changing the project BPM leaves preview notes at the
            // MIDI file's original tempo.
            const map = state.timeline.masterTempoMap;
            const offsetSec = clipOffsetSeconds(state, clip);
            let loLocal = startSec - offsetSec;
            let hiLocal = endSec - offsetSec;
            if (clip.regionStartTick != null || clip.regionEndTick != null) {
                const regionStartBeats = (clip.regionStartTick ?? 0) / CANONICAL_PPQ;
                const regionEndBeats = (clip.regionEndTick ?? clip.regionStartTick ?? 0) / CANONICAL_PPQ;
                const regionStartSec = beatsToSeconds(state.timeline.masterTempoMap, regionStartBeats, spbFallback);
                const regionEndSec = beatsToSeconds(state.timeline.masterTempoMap, regionEndBeats, spbFallback);
                if (loLocal < regionStartSec) loLocal = regionStartSec;
                if (hiLocal > regionEndSec) hiLocal = regionEndSec;
            }
            if (!(hiLocal > loLocal)) continue;

            const notesRaw = cache.notesRaw;
            let startIdx = 0;
            if (cache.bounds && notesRaw.length > 32) {
                const localStartBeats = secondsToBeats(map, Math.max(0, loLocal), spbFallback);
                const searchStartTick = Math.max(
                    0,
                    Math.round(localStartBeats * CANONICAL_PPQ) - cache.bounds.maxDurationTicks
                );
                let lo = 0;
                let hi = notesRaw.length;
                while (lo < hi) {
                    const mid = (lo + hi) >>> 1;
                    if (notesRaw[mid].startTick < searchStartTick) lo = mid + 1;
                    else hi = mid;
                }
                startIdx = lo;
            }

            for (let i = startIdx; i < notesRaw.length; i++) {
                const n = notesRaw[i];
                if (n.endTick <= (clip.regionStartTick ?? 0) || n.startTick >= (clip.regionEndTick ?? Number.POSITIVE_INFINITY)) {
                    continue;
                }
                let startBeats: number | undefined = n.startBeat;
                let endBeats: number | undefined = n.endBeat;
                if (startBeats == null) startBeats = n.startTick / CANONICAL_PPQ;
                if (endBeats == null) endBeats = n.endTick / CANONICAL_PPQ;
                const sLocal = beatsToSeconds(map, startBeats, spbFallback);
                const eLocal = beatsToSeconds(map, endBeats, spbFallback);
                if (!(eLocal >= loLocal && sLocal <= hiLocal)) {
                    if (cache.bounds && sLocal >= hiLocal) break;
                    continue;
                }
                const absStart = sLocal + offsetSec;
                const absEnd = eLocal + offsetSec;
                if (!(absEnd >= startSec && absStart <= endSec)) continue;
                out.push({
                    trackId: id,
                    clipId: clip.id,
                    sourceId: clip.sourceId,
                    note: n.note,
                    channel: n.channel || 0,
                    startSec: absStart,
                    endSec: absEnd,
                    velocity: n.velocity ?? 0,
                    duration: Math.max(0, absEnd - absStart),
                });
            }
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
    if (!track || track.type !== 'midi') return [];
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
