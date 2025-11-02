import type { AudioFeatureAnalysisParams, AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { normalizeFeatureTrackMap } from '@audio/features/featureTrackIdentity';

function mergeAnalysisParams(
    existing: AudioFeatureAnalysisParams | undefined,
    incoming: AudioFeatureAnalysisParams | undefined
): AudioFeatureAnalysisParams | undefined {
    if (!existing) {
        return incoming;
    }
    if (!incoming) {
        return existing;
    }
    const merged: AudioFeatureAnalysisParams = {
        ...existing,
        ...incoming,
        calculatorVersions: {
            ...existing.calculatorVersions,
            ...incoming.calculatorVersions,
        },
    };
    return merged;
}

export function mergeFeatureCaches(
    existing: AudioFeatureCache | undefined,
    incoming: AudioFeatureCache
): AudioFeatureCache {
    if (!existing) {
        const normalizedIncoming = normalizeFeatureTrackMap(
            incoming.featureTracks,
            incoming.defaultAnalysisProfileId ?? null
        );
        return {
            ...incoming,
            featureTracks: normalizedIncoming,
        };
    }
    const normalizedExistingTracks = normalizeFeatureTrackMap(
        existing.featureTracks,
        existing.defaultAnalysisProfileId ?? null
    );
    const normalizedIncomingTracks = normalizeFeatureTrackMap(
        incoming.featureTracks,
        incoming.defaultAnalysisProfileId ?? null
    );
    return {
        ...existing,
        ...incoming,
        version: Math.max(existing.version ?? 0, incoming.version ?? 0),
        audioSourceId: incoming.audioSourceId || existing.audioSourceId,
        hopTicks: incoming.hopTicks ?? existing.hopTicks,
        hopSeconds: incoming.hopSeconds ?? existing.hopSeconds,
        startTimeSeconds: incoming.startTimeSeconds ?? existing.startTimeSeconds,
        tempoProjection: incoming.tempoProjection ?? existing.tempoProjection,
        frameCount: incoming.frameCount || existing.frameCount,
        analysisParams: mergeAnalysisParams(existing.analysisParams, incoming.analysisParams)!,
        analysisProfiles: {
            ...(existing.analysisProfiles ?? {}),
            ...(incoming.analysisProfiles ?? {}),
        },
        defaultAnalysisProfileId: incoming.defaultAnalysisProfileId ?? existing.defaultAnalysisProfileId,
        featureTracks: {
            ...normalizedExistingTracks,
            ...normalizedIncomingTracks,
        },
    };
}
