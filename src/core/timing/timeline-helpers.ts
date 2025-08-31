import type { TempoMapEntry } from '@state/timelineTypes';
import type { TimelineState } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';

// Simple beats<->seconds using a seconds-based tempo map
export function beatsToSecondsWithMap(map: TempoMapEntry[] | undefined, beats: number, bpmFallback = 120): number {
    const secondsPerBeatFromTempo = (tempoMicro: number) => tempoMicro / 1_000_000;
    if (!map || map.length === 0) {
        return (60 / bpmFallback) * beats;
    }
    // Convert beats to seconds by integrating across segments assuming constant tempo between entries
    let seconds = 0;
    let remainingBeats = beats;
    // We don't have beat positions in map; approximate using microseconds/quarter at each segment.
    for (let i = 0; i < map.length && remainingBeats > 0; i++) {
        const tempo = map[i].tempo;
        const spb = secondsPerBeatFromTempo(tempo);
        // Without explicit segment length in beats, return linear approximation
        const consume = remainingBeats;
        seconds += consume * spb;
        remainingBeats -= consume;
    }
    return seconds;
}

export function secondsToBeatsWithMap(map: TempoMapEntry[] | undefined, seconds: number, bpmFallback = 120): number {
    const secondsPerBeatFromTempo = (tempoMicro: number) => tempoMicro / 1_000_000;
    if (!map || map.length === 0) {
        const spb = 60 / bpmFallback;
        return seconds / spb;
    }
    // Linear approximation similar to above
    let beats = 0;
    let remaining = seconds;
    for (let i = 0; i < map.length && remaining > 0; i++) {
        const spb = secondsPerBeatFromTempo(map[i].tempo);
        const consume = remaining;
        beats += consume / spb;
        remaining -= consume;
    }
    return beats;
}

export function mapTimelineToTrackSeconds(track: { offsetSec?: number }, timelineSec: number): number | null {
    const offset = track.offsetSec ?? 0;
    const local = timelineSec - offset;
    return local >= 0 ? local : null;
}

export function trackBeatsToTimelineSeconds(
    track: { offsetSec?: number },
    beats: number,
    map?: TempoMapEntry[]
): number {
    const sec = beatsToSecondsWithMap(map, beats);
    return (track.offsetSec ?? 0) + sec;
}

// Windowed note query across tracks using state and simple mapping
export function getNotesInWindow(state: TimelineState, args: { trackIds: string[]; startSec: number; endSec: number }) {
    return selectNotesInWindow(state, args);
}

export function alignAcrossTracks(
    state: TimelineState,
    params: { fromTrackId: string; toTrackId: string; timeInFromTrack: number }
): number {
    const from = state.tracks[params.fromTrackId];
    const to = state.tracks[params.toTrackId];
    if (!from || !to) return params.timeInFromTrack;
    const timelineTime = (from.offsetSec ?? 0) + params.timeInFromTrack;
    const toLocal = timelineTime - (to.offsetSec ?? 0);
    return toLocal;
}
