import type { AudioFeatureCache, AudioFeatureTrack } from './audioFeatureTypes';

function ensureTrackUpgrade(track: AudioFeatureTrack, hopTicks: number, tempoMapHash?: string): AudioFeatureTrack {
    const startTimeSeconds = track.startTimeSeconds ?? 0;
    const projection = track.tempoProjection ?? {
        hopTicks,
        startTick: 0,
        tempoMapHash,
    };
    return {
        ...track,
        hopTicks,
        startTimeSeconds,
        tempoProjection: projection,
    };
}

export function upgradeAudioFeatureCache(cache: AudioFeatureCache): AudioFeatureCache {
    if (cache.version >= 2) {
        return cache;
    }
    const hopTicks = Math.max(1, Math.round(cache.hopTicks ?? 1));
    const tempoMapHash = cache.analysisParams?.tempoMapHash;
    const startTimeSeconds = cache.startTimeSeconds ?? 0;
    const tempoProjection = cache.tempoProjection ?? {
        hopTicks,
        startTick: 0,
        tempoMapHash,
    };
    const featureTracks: Record<string, AudioFeatureTrack> = {};
    for (const [key, track] of Object.entries(cache.featureTracks || {})) {
        const trackHopTicks = Math.max(1, Math.round(track.hopTicks ?? hopTicks));
        featureTracks[key] = ensureTrackUpgrade(track, trackHopTicks, tempoMapHash);
    }
    return {
        version: 2,
        audioSourceId: cache.audioSourceId,
        hopTicks,
        hopSeconds: cache.hopSeconds,
        startTimeSeconds,
        tempoProjection,
        frameCount: cache.frameCount,
        featureTracks,
        analysisParams: cache.analysisParams,
    };
}
