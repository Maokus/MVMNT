import type { AudioFeatureAnalysisParams, AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function mergeAnalysisParams(
    existing: AudioFeatureAnalysisParams | undefined,
    incoming: AudioFeatureAnalysisParams | undefined,
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
    incoming: AudioFeatureCache,
): AudioFeatureCache {
    if (!existing) {
        return incoming;
    }
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
        featureTracks: {
            ...existing.featureTracks,
            ...incoming.featureTracks,
        },
    };
}
