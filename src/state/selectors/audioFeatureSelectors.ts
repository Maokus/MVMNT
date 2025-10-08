import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import type { AudioFeatureCache, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';

export function selectAudioFeatureCache(state: TimelineState, sourceId: string):
    | AudioFeatureCache
    | undefined {
    return state.audioFeatureCaches[sourceId];
}

export function selectAudioFeatureStatus(state: TimelineState, sourceId: string) {
    return state.audioFeatureCacheStatus[sourceId];
}

export function selectAudioFeatureTrack(
    state: TimelineState,
    sourceId: string,
    trackKey: string,
): AudioFeatureTrack | undefined {
    const cache = state.audioFeatureCaches[sourceId];
    return cache?.featureTracks?.[trackKey];
}

export function useAudioFeatureCache(sourceId: string): AudioFeatureCache | undefined {
    return useTimelineStore((s) => s.audioFeatureCaches[sourceId]);
}

export function useAudioFeatureStatus(sourceId: string) {
    return useTimelineStore((s) => s.audioFeatureCacheStatus[sourceId]);
}

export function useAudioFeatureTrack(sourceId: string, trackKey: string): AudioFeatureTrack | undefined {
    return useTimelineStore((s) => s.audioFeatureCaches[sourceId]?.featureTracks?.[trackKey]);
}
