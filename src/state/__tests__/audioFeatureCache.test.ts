import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import {
    selectAudioFeatureCache,
    selectAudioFeatureStatus,
    selectAudioFeatureTrack,
} from '@state/selectors/audioFeatureSelectors';

function createTestCache(sourceId: string, frameCount = 8, hopTicks = 120): AudioFeatureCache {
    const data = Float32Array.from({ length: frameCount }, (_, idx) => idx / frameCount);
    const hopSeconds = hopTicks / 1920;
    const analysisProfile = {
        id: 'default',
        windowSize: 256,
        hopSize: 128,
        overlap: 2,
        sampleRate: 48000,
        smoothing: null,
        fftSize: null,
        minDecibels: null,
        maxDecibels: null,
        window: null,
    } as const;
    return {
        version: 3,
        audioSourceId: sourceId,
        hopSeconds,
        hopTicks,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 256,
            hopSize: 128,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: { 'mvmnt.rms': 1 },
        },
        featureTracks: {
            rms: {
                key: 'rms',
                calculatorId: 'mvmnt.rms',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data,
                channelAliases: null,
                analysisProfileId: 'default',
            },
        },
        analysisProfiles: { default: analysisProfile },
        defaultAnalysisProfileId: 'default',
        channelAliases: undefined,
    };
}

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {},
        tracksOrder: [],
        audioCache: {},
        audioFeatureCaches: {},
        audioFeatureCacheStatus: {},
        playbackRange: undefined,
        playbackRangeUserDefined: false,
    }));
});

describe('audio feature cache integration', () => {
    it('stores caches and exposes selectors with metadata', () => {
        const sourceId = 'aud_test';
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [sourceId]: {
                    id: sourceId,
                    name: 'Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [sourceId],
        }));
        const cache = createTestCache(sourceId, 16, 240);
        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, cache);
        const state = useTimelineStore.getState();
        const stored = selectAudioFeatureCache(state, sourceId);
        expect(stored).toBeDefined();
        expect(stored?.analysisParams.windowSize).toBe(256);
        const status = selectAudioFeatureStatus(state, sourceId);
        expect(status?.state).toBe('ready');
        expect(status?.sourceHash).toBeTruthy();
        const track = selectAudioFeatureTrack(state, sourceId, 'rms');
        expect(track?.frameCount).toBe(16);
    });

    it('auto adjusts playback range using feature cache duration when audio cache missing', () => {
        const sourceId = 'aud_features';
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [sourceId]: {
                    id: sourceId,
                    name: 'Feature Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [sourceId],
        }));
        const cache = createTestCache(sourceId, 32, 120);
        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, cache);
        const state = useTimelineStore.getState();
        expect(state.playbackRangeUserDefined).toBe(true);
        expect(state.playbackRange?.endTick).toBeGreaterThan(cache.hopTicks ?? 0);
    });

    it('marks caches stale when tempo changes', () => {
        const sourceId = 'aud_stale';
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [sourceId]: {
                    id: sourceId,
                    name: 'Tempo Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [sourceId],
        }));
        const cache = createTestCache(sourceId, 8, 60);
        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, cache);
        useTimelineStore.getState().setGlobalBpm(90);
        const state = useTimelineStore.getState();
        const status = selectAudioFeatureStatus(state, sourceId);
        expect(status?.state).toBe('stale');
    });

    it('invalidates caches when calculator versions advance', () => {
        const sourceId = 'aud_calc_version';
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [sourceId]: {
                    id: sourceId,
                    name: 'Versioned Feature',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [sourceId],
        }));
        const cache = createTestCache(sourceId, 6, 96);
        cache.featureTracks.rms.version = 1;
        cache.featureTracks.rms.calculatorId = 'plugin.feature';
        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, cache);
        useTimelineStore.getState().invalidateAudioFeatureCachesByCalculator('plugin.feature', 2);
        const status = selectAudioFeatureStatus(useTimelineStore.getState(), sourceId);
        expect(status?.state).toBe('stale');
        expect(status?.message).toBe('calculator updated');
    });
});
