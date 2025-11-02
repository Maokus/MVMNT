import {
    getTempoAlignedFrame,
    getTempoAlignedRange,
    type TempoAlignedFrameOptions,
    type TempoAlignedFrameSample,
    type TempoAlignedRangeOptions,
    type TempoAlignedRangeSample,
} from '@audio/features/tempoAlignedViewAdapter';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import type { AudioFeatureCache, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import { resolveFeatureTrackFromCache } from '@audio/features/featureTrackIdentity';

export type AudioFeatureFrameOptions = TempoAlignedFrameOptions;
export type AudioFeatureFrameSample = TempoAlignedFrameSample;
export type AudioFeatureRangeOptions = TempoAlignedRangeOptions;
export type AudioFeatureRangeSample = TempoAlignedRangeSample;

export function selectAudioFeatureCache(state: TimelineState, sourceId: string): AudioFeatureCache | undefined {
    return state.audioFeatureCaches[sourceId];
}

export function selectAudioFeatureStatus(state: TimelineState, sourceId: string) {
    return state.audioFeatureCacheStatus[sourceId];
}

export function selectAudioFeatureTrack(
    state: TimelineState,
    sourceId: string,
    trackKey: string,
    analysisProfileId?: string | null
): AudioFeatureTrack | undefined {
    const cache = state.audioFeatureCaches[sourceId];
    const { track } = resolveFeatureTrackFromCache(cache, trackKey, {
        analysisProfileId,
    });
    return track;
}

export function selectAudioFeatureFrame(
    state: TimelineState,
    trackId: string,
    featureKey: string,
    tick: number,
    options: AudioFeatureFrameOptions = {}
): AudioFeatureFrameSample | undefined {
    const { sample } = getTempoAlignedFrame(state, {
        trackId,
        featureKey,
        tick,
        options,
    });
    return sample;
}

export function sampleAudioFeatureRange(
    state: TimelineState,
    trackId: string,
    featureKey: string,
    startTick: number,
    endTick: number,
    options: AudioFeatureRangeOptions = {}
): AudioFeatureRangeSample | undefined {
    const { range } = getTempoAlignedRange(state, {
        trackId,
        featureKey,
        startTick,
        endTick,
        options,
    });
    return range;
}

export function useAudioFeatureCache(sourceId: string): AudioFeatureCache | undefined {
    return useTimelineStore((s) => s.audioFeatureCaches[sourceId]);
}

export function useAudioFeatureStatus(sourceId: string) {
    return useTimelineStore((s) => s.audioFeatureCacheStatus[sourceId]);
}

export function useAudioFeatureTrack(
    sourceId: string,
    trackKey: string,
    analysisProfileId?: string | null
): AudioFeatureTrack | undefined {
    return useTimelineStore(
        (s) =>
            resolveFeatureTrackFromCache(s.audioFeatureCaches[sourceId], trackKey, {
                analysisProfileId,
            }).track
    );
}
