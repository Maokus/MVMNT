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

/**
 * Compute how many ticks a given duration (in seconds) spans when starting
 * at `atTick` on the timeline (tempo-map-aware).
 *
 * With a flat tempo this equals the plain `secondsToTicks` result.
 * With a tempo map the answer depends on the tempo(s) active during the
 * window [atTick, atTick + …].
 */
export function secondsToTicksAt(
    context: TimelineTimingContext,
    durationSeconds: number,
    atTick: number,
): number {
    const startSeconds = ticksToSeconds(context, atTick);
    const endSeconds = startSeconds + durationSeconds;
    const endTicks = secondsToTicks(context, endSeconds);
    return endTicks - atTick;
}

/**
 * Inverse of `secondsToTicksAt`: convert a tick span back to seconds
 * at a specific timeline position.
 */
export function ticksToSecondsAt(
    context: TimelineTimingContext,
    durationTicks: number,
    atTick: number,
): number {
    const startSeconds = ticksToSeconds(context, atTick);
    const endSeconds = ticksToSeconds(context, atTick + durationTicks);
    return endSeconds - startSeconds;
}
