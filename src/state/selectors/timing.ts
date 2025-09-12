import type { TimelineState } from '@state/timelineStore';
import type { TempoMapEntry } from '@core/timing/types';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';

function getFallbackSpb(state: TimelineState): number {
    const bpm = state.timeline.globalBpm || 120;
    return 60 / bpm;
}

function getTempoMap(state: TimelineState): TempoMapEntry[] | undefined {
    return state.timeline.masterTempoMap;
}

export function secondsToBeatsSelector(state: TimelineState, seconds: number): number {
    return secondsToBeats(getTempoMap(state), seconds, getFallbackSpb(state));
}

export function beatsToSecondsSelector(state: TimelineState, beats: number): number {
    return beatsToSeconds(getTempoMap(state), beats, getFallbackSpb(state));
}

export function secondsToBars(state: TimelineState, seconds: number): number {
    const beats = secondsToBeatsSelector(state, seconds);
    const bpb = state.timeline.beatsPerBar || 4;
    return beats / bpb;
}

export function barsToSeconds(state: TimelineState, bars: number): number {
    const bpb = state.timeline.beatsPerBar || 4;
    const beats = bars * bpb;
    return beatsToSecondsSelector(state, beats);
}

// Phase 1 helpers (but useful in Phase 0): derive current position in beats/bars
export function positionBeats(state: TimelineState): number {
    return secondsToBeatsSelector(state, state.timeline.currentTimeSec);
}

export function positionBars(state: TimelineState): number {
    const bpb = state.timeline.beatsPerBar || 4;
    return positionBeats(state) / bpb;
}
