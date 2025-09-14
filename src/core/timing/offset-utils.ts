import { CANONICAL_PPQ } from './ppq';
import { beatsToSeconds } from './tempo-utils';
import type { TempoMapEntry } from './types';

// Convert offset ticks (canonical domain) to beats
export function offsetTicksToBeats(offsetTicks: number): number {
    return (offsetTicks || 0) / CANONICAL_PPQ;
}

// Convert beats to canonical ticks (rounded) - inverse helper
export function beatsToOffsetTicks(beats: number): number {
    return Math.round(beats * CANONICAL_PPQ);
}

// Convert offset ticks to seconds using tempo map + fallback seconds-per-beat
export function offsetTicksToSeconds(
    offsetTicks: number,
    tempoMap: TempoMapEntry[] | undefined,
    secondsPerBeatFallback: number,
    beatsToSecondsImpl: typeof beatsToSeconds = beatsToSeconds
): number {
    const beats = offsetTicksToBeats(offsetTicks);
    return beatsToSecondsImpl(tempoMap, beats, secondsPerBeatFallback);
}
