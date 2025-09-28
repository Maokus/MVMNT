import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { TempoMapEntry } from '@state/timelineTypes';
export interface TimelineTimingContext {
    ticksPerQuarter: number;
    globalBpm: number;
    beatsPerBar: number;
    tempoMap?: TempoMapEntry[];
}

export interface TimelineTimingSlice {
    globalBpm: number;
    beatsPerBar: number;
    masterTempoMap?: TempoMapEntry[];
}

function fallbackSecondsPerBeat(bpm: number): number {
    const resolved = typeof bpm === 'number' && bpm > 0 ? bpm : 120;
    return 60 / resolved;
}

export function createTimingContext(
    timeline: TimelineTimingSlice,
    ticksPerQuarter: number = CANONICAL_PPQ
): TimelineTimingContext {
    return {
        ticksPerQuarter,
        globalBpm: timeline.globalBpm || 120,
        beatsPerBar: timeline.beatsPerBar || 4,
        tempoMap: timeline.masterTempoMap,
    };
}

export function secondsToTicks(context: TimelineTimingContext, seconds: number): number {
    const beats = secondsToBeats(context.tempoMap, seconds, fallbackSecondsPerBeat(context.globalBpm));
    return beats * context.ticksPerQuarter;
}

export function ticksToSeconds(context: TimelineTimingContext, ticks: number): number {
    const beats = ticks / context.ticksPerQuarter;
    return beatsToSeconds(context.tempoMap, beats, fallbackSecondsPerBeat(context.globalBpm));
}

export function secondsToBeatsContext(context: TimelineTimingContext, seconds: number): number {
    return secondsToBeats(context.tempoMap, seconds, fallbackSecondsPerBeat(context.globalBpm));
}

export function beatsToSecondsContext(context: TimelineTimingContext, beats: number): number {
    return beatsToSeconds(context.tempoMap, beats, fallbackSecondsPerBeat(context.globalBpm));
}

export function secondsToBars(context: TimelineTimingContext, seconds: number): number {
    const beats = secondsToBeatsContext(context, seconds);
    return beats / (context.beatsPerBar || 4);
}

export function barsToSeconds(context: TimelineTimingContext, bars: number): number {
    const beats = bars * (context.beatsPerBar || 4);
    return beatsToSecondsContext(context, beats);
}

export function beatsToTicks(context: TimelineTimingContext, beats: number): number {
    return beats * context.ticksPerQuarter;
}

export function ticksToBeats(context: TimelineTimingContext, ticks: number): number {
    return ticks / context.ticksPerQuarter;
}
