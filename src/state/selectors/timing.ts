import type { TimelineState } from '@state/timelineStore';
import type { TempoMapEntry } from '@core/timing/types';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';

// Phase 5: canonical domain is ticks. These seconds<->beats selectors are kept for transitional display only and will be removed in Phase 6.

function getFallbackSpb(state: TimelineState): number {
    const bpm = state.timeline.globalBpm || 120;
    return 60 / bpm;
}

function getTempoMap(state: TimelineState): TempoMapEntry[] | undefined {
    return state.timeline.masterTempoMap;
}

export function secondsToBeatsSelector(state: TimelineState, seconds: number): number {
    // deprecated
    return secondsToBeats(getTempoMap(state), seconds, getFallbackSpb(state));
}

export function beatsToSecondsSelector(state: TimelineState, beats: number): number {
    // deprecated
    return beatsToSeconds(getTempoMap(state), beats, getFallbackSpb(state));
}

export function secondsToBars(state: TimelineState, seconds: number): number {
    // deprecated
    const beats = secondsToBeatsSelector(state, seconds);
    const bpb = state.timeline.beatsPerBar || 4;
    return beats / bpb;
}

export function barsToSeconds(state: TimelineState, bars: number): number {
    // deprecated
    const bpb = state.timeline.beatsPerBar || 4;
    const beats = bars * bpb;
    return beatsToSecondsSelector(state, beats);
}

// Phase 1 helpers (but useful in Phase 0): derive current position in beats/bars
export function positionBeats(state: TimelineState): number {
    // Updated: derive from canonical tick domain (previously relied on deprecated currentTimeSec)
    const ppq = 480; // TODO: unify with CANONICAL_PPQ if exported here (kept local to avoid circular import)
    return state.timeline.currentTick / ppq;
}

export function positionBars(state: TimelineState): number {
    // deprecated
    const bpb = state.timeline.beatsPerBar || 4;
    return positionBeats(state) / bpb;
}

// Tick-based equivalents (preferred)
export function ticksToBeats(state: TimelineState, tick: number): number {
    const ppq = 480; // unified PPQ (matches TimingManager + CANONICAL_PPQ)
    return tick / ppq;
}
export function ticksToBars(state: TimelineState, tick: number): number {
    const beats = ticksToBeats(state, tick);
    return beats / (state.timeline.beatsPerBar || 4);
}
export function currentBeats(state: TimelineState): number {
    return ticksToBeats(state, state.timeline.currentTick);
}
export function currentBars(state: TimelineState): number {
    return ticksToBars(state, state.timeline.currentTick);
}
