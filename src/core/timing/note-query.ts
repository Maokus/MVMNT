// Pure note query & mapping utilities
// Operate on the Zustand timeline store state shape (tracks + midiCache) without side effects.
// All time domain inputs/outputs are in timeline seconds or ticks as documented.

import type { TimelineState, TimelineTrack } from '@state/timelineStore';
import { beatsToSeconds, secondsToBeats } from './tempo-utils';
import { CANONICAL_PPQ } from './ppq';
import {
    getMidiClipTimelineBounds,
    getMidiClipsForTrack,
    getPrimaryMidiClip,
    type MidiClip,
} from '@state/timeline/midiClips';

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

function timelineTicksToSeconds(state: TimelineState, ticks: number): number {
    return beatsToSeconds(state.timeline.masterTempoMap, ticks / CANONICAL_PPQ, getSecondsPerBeatFallback(state));
}

function timelineSecondsToTicks(state: TimelineState, seconds: number): number {
    return secondsToBeats(state.timeline.masterTempoMap, seconds, getSecondsPerBeatFallback(state)) * CANONICAL_PPQ;
}

// Map timeline seconds -> track local seconds accounting for offset & (future) regions
export function timelineToTrackSeconds(state: TimelineState, track: TimelineTrack, timelineSec: number): number | null {
    const clip = getPrimaryMidiClip(track);
    const offsetTicks = clip?.offsetTicks ?? track.offsetTicks ?? 0;
    const localTicks = timelineSecondsToTicks(state, timelineSec) - offsetTicks;
    const regionStartTick = clip?.regionStartTick ?? track.regionStartTick;
    const regionEndTick = clip?.regionEndTick ?? track.regionEndTick;
    if (regionStartTick != null || regionEndTick != null) {
        if (localTicks < (regionStartTick ?? 0) || localTicks > (regionEndTick ?? Number.POSITIVE_INFINITY))
            return null;
    }
    return Math.max(0, timelineSec - timelineTicksToSeconds(state, offsetTicks));
}

// Convert track-local beats to absolute timeline seconds
export function trackBeatsToTimelineSeconds(state: TimelineState, track: TimelineTrack, beats: number): number {
    const clip = getPrimaryMidiClip(track);
    const offsetTicks = clip?.offsetTicks ?? track.offsetTicks ?? 0;
    return timelineTicksToSeconds(state, offsetTicks + beats * CANONICAL_PPQ);
}

// Convert timeline seconds to track-local beats
export function timelineSecondsToTrackBeats(state: TimelineState, track: TimelineTrack, timelineSec: number): number {
    const clip = getPrimaryMidiClip(track);
    const offsetTicks = clip?.offsetTicks ?? track.offsetTicks ?? 0;
    return (timelineSecondsToTicks(state, timelineSec) - offsetTicks) / CANONICAL_PPQ;
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
                const clipStartSec = beatsToSeconds(
                    state.timeline.masterTempoMap,
                    clipBounds.startTick / CANONICAL_PPQ,
                    getSecondsPerBeatFallback(state)
                );
                const clipEndSec = beatsToSeconds(
                    state.timeline.masterTempoMap,
                    clipBounds.endTick / CANONICAL_PPQ,
                    getSecondsPerBeatFallback(state)
                );
                if (clipEndSec <= startSec || clipStartSec >= endSec) continue;
            }
            const cache = state.midiCache[clip.sourceId];
            if (!cache) continue;
            // Imported MIDI tempo is source metadata. Once the file is placed on
            // the timeline, note timing must follow the timeline's tempo map (or
            // global BPM fallback), just like transport and audio playback.
            // Otherwise changing the project BPM leaves preview notes at the
            // MIDI file's original tempo.
            const windowStartTick = timelineSecondsToTicks(state, startSec) - clip.offsetTicks;
            const windowEndTick = timelineSecondsToTicks(state, endSec) - clip.offsetTicks;
            const localStartTick = Math.max(clip.regionStartTick ?? 0, windowStartTick);
            const localEndTick = Math.min(clip.regionEndTick ?? Number.POSITIVE_INFINITY, windowEndTick);
            if (!(localEndTick > localStartTick)) continue;

            const notesRaw = cache.notesRaw;
            let startIdx = 0;
            if (cache.bounds && notesRaw.length > 32) {
                const searchStartTick = Math.max(0, Math.round(localStartTick) - cache.bounds.maxDurationTicks);
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
                if (
                    n.endTick <= (clip.regionStartTick ?? 0) ||
                    n.startTick >= (clip.regionEndTick ?? Number.POSITIVE_INFINITY)
                ) {
                    continue;
                }
                if (!(n.endTick > localStartTick && n.startTick < localEndTick)) {
                    if (cache.bounds && n.startTick >= localEndTick) break;
                    continue;
                }
                const absStart = timelineTicksToSeconds(state, clip.offsetTicks + n.startTick);
                const absEnd = timelineTicksToSeconds(state, clip.offsetTicks + n.endTick);
                if (!(absEnd > startSec && absStart < endSec)) continue;
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
