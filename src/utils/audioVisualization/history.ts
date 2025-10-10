import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import { getSharedTimingManager } from '@state/timelineStore';
import { resolveDescriptorChannelIndex, resolveFeatureContext } from '@core/scene/elements/audioFeatureUtils';

const MIN_FRAME_COUNT = 1;
const MIN_SPACING_SECONDS = 1 / 120;

export type FeatureHistoryHopStrategy =
    | { type: 'profileHop' }
    | { type: 'equalSpacing'; seconds: number };

export interface FeatureHistoryFrame {
    index: number;
    tick: number;
    timeSeconds: number;
    values: number[];
}

function clampFrameCount(count: number): number {
    if (!Number.isFinite(count)) return MIN_FRAME_COUNT;
    return Math.max(MIN_FRAME_COUNT, Math.floor(count));
}

function resolveSpacingSeconds(
    strategy: FeatureHistoryHopStrategy | undefined,
    featureTrack: { hopSeconds?: number | null },
    cache: {
        hopSeconds?: number | null;
        analysisParams?: { hopSize?: number; sampleRate?: number };
    },
): number {
    if (strategy?.type === 'equalSpacing') {
        const requested = Number.isFinite(strategy.seconds) ? strategy.seconds : MIN_SPACING_SECONDS;
        return Math.max(MIN_SPACING_SECONDS, requested);
    }
    const hopSecondsCandidates: Array<number | undefined | null> = [
        featureTrack.hopSeconds,
        cache.hopSeconds,
    ];
    const analysis = cache.analysisParams;
    if (analysis && Number.isFinite(analysis.hopSize) && Number.isFinite(analysis.sampleRate) && analysis.sampleRate! > 0) {
        hopSecondsCandidates.push(analysis.hopSize! / analysis.sampleRate!);
    }
    for (const candidate of hopSecondsCandidates) {
        if (Number.isFinite(candidate) && (candidate as number) > 0) {
            return Math.max(MIN_SPACING_SECONDS, candidate as number);
        }
    }
    return MIN_SPACING_SECONDS;
}

function buildSampleTimeline(
    targetTime: number,
    frameCount: number,
    spacingSeconds: number,
    earliestSeconds: number,
): number[] {
    const times: number[] = [];
    for (let i = 0; i < frameCount; i += 1) {
        const offset = spacingSeconds * (frameCount - 1 - i);
        const sampleTime = Math.max(earliestSeconds, targetTime - offset);
        times.push(sampleTime);
    }
    return times;
}

function computeFrameTimes(
    frameTicks: Float64Array,
    frameSeconds: Float64Array | undefined,
    ticksToSeconds: (ticks: number) => number,
): number[] {
    const times: number[] = [];
    for (let i = 0; i < frameTicks.length; i += 1) {
        const explicit = frameSeconds?.[i];
        if (Number.isFinite(explicit)) {
            times.push(explicit as number);
        } else {
            times.push(ticksToSeconds(frameTicks[i] ?? 0));
        }
    }
    return times;
}

function findNearestFrameIndex(sampleTime: number, frameTimes: number[], startIndex: number): number {
    if (!frameTimes.length) return 0;
    let index = Math.max(0, Math.min(frameTimes.length - 1, startIndex));
    while (index + 1 < frameTimes.length && frameTimes[index + 1] <= sampleTime) {
        index += 1;
    }
    if (index + 1 < frameTimes.length) {
        const currentDistance = Math.abs(frameTimes[index] - sampleTime);
        const nextDistance = Math.abs(frameTimes[index + 1] - sampleTime);
        if (nextDistance < currentDistance) {
            return index + 1;
        }
    }
    return index;
}

export function sampleFeatureHistory(
    trackId: string | null,
    descriptor: AudioFeatureDescriptor,
    targetTime: number,
    frameCount: number,
    hopStrategy: FeatureHistoryHopStrategy = { type: 'profileHop' },
): FeatureHistoryFrame[] {
    if (!trackId || !descriptor?.featureKey) {
        return [];
    }

    const context = resolveFeatureContext(trackId, descriptor.featureKey);
    if (!context) {
        return [];
    }

    const { cache, featureTrack, state } = context;
    const tm = getSharedTimingManager();
    const safeFrameCount = clampFrameCount(frameCount);
    const spacingSeconds = resolveSpacingSeconds(hopStrategy, featureTrack, cache);
    const earliestSeconds = Math.max(0, cache.startTimeSeconds ?? 0);
    const timeline = buildSampleTimeline(targetTime, safeFrameCount, spacingSeconds, earliestSeconds);
    const startSeconds = timeline[0] ?? targetTime;
    const startTick = tm.secondsToTicks(Math.max(0, startSeconds));
    const endTick = tm.secondsToTicks(Math.max(startSeconds, targetTime));

    const channelIndex = resolveDescriptorChannelIndex(trackId, descriptor);
    const range = sampleAudioFeatureRange(state, trackId, descriptor.featureKey, startTick, endTick, {
        bandIndex: descriptor.bandIndex ?? undefined,
        channelIndex: channelIndex ?? undefined,
        smoothing: descriptor.smoothing ?? undefined,
        framePadding: 2,
    });

    if (!range || range.frameCount <= 0 || !range.data?.length) {
        return [];
    }

    const frameTimes = computeFrameTimes(range.frameTicks, range.frameSeconds, tm.ticksToSeconds.bind(tm));
    const channels = Math.max(1, range.channels || 1);
    const history: FeatureHistoryFrame[] = [];
    let searchIndex = 0;

    for (let i = 0; i < timeline.length; i += 1) {
        const sampleTime = timeline[i];
        searchIndex = findNearestFrameIndex(sampleTime, frameTimes, searchIndex);
        const tick = range.frameTicks[searchIndex] ?? range.windowStartTick ?? 0;
        const timeSeconds = frameTimes[searchIndex] ?? sampleTime;
        const values: number[] = [];
        const baseOffset = searchIndex * channels;
        for (let channel = 0; channel < channels; channel += 1) {
            values.push(range.data[baseOffset + channel] ?? 0);
        }
        history.push({ index: i, tick, timeSeconds, values });
    }

    return history;
}
