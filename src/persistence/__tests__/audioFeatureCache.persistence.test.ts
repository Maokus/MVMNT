import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';
import type { ExportSceneResultInline } from '@persistence/export';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createFeatureCache(sourceId: string): AudioFeatureCache {
    const frameCount = 10;
    const hopTicks = 120;
    return {
        version: 1,
        audioSourceId: sourceId,
        hopTicks,
        hopSeconds: 0.04,
        frameCount,
        analysisParams: {
            windowSize: 1024,
            hopSize: 512,
            overlap: 2,
            sampleRate: 44100,
            calculatorVersions: {
                'mvmnt.spectrogram': 1,
                'mvmnt.rms': 1,
            },
        },
        featureTracks: {
            spectrogram: {
                key: 'spectrogram',
                calculatorId: 'mvmnt.spectrogram',
                version: 1,
                frameCount,
                channels: 4,
                hopTicks,
                hopSeconds: 0.04,
                format: 'float32',
                data: Float32Array.from({ length: frameCount * 4 }, (_, idx) => idx / (frameCount * 4)),
                metadata: { bands: 4 },
            },
        },
    };
}

async function exportInlineScene(): Promise<ExportSceneResultInline> {
    const result = await exportScene(undefined, { storage: 'inline-json' });
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {},
        tracksOrder: [],
        audioFeatureCaches: {},
        audioFeatureCacheStatus: {},
    }));
});

describe('audio feature cache persistence', () => {
    it('exports and imports serialized caches with calculator metadata', async () => {
        const trackId = 'aud_persist';
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [trackId]: {
                    id: trackId,
                    name: 'Persisted Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [trackId],
        }));
        const cache = createFeatureCache(trackId);
        useTimelineStore.getState().ingestAudioFeatureCache(trackId, cache);
        const exported = await exportInlineScene();
        const timelineSection = exported.envelope.timeline;
        expect(timelineSection.audioFeatureCaches?.aud_persist).toBeDefined();
        const serialized = timelineSection.audioFeatureCaches!.aud_persist;
        expect(serialized.analysisParams.windowSize).toBe(1024);
        expect(serialized.featureTracks.spectrogram.metadata?.bands).toBe(4);
        useTimelineStore.getState().resetTimeline();
        const importResult = await importScene(exported.json);
        expect(importResult.ok).toBe(true);
        const restored = useTimelineStore.getState().audioFeatureCaches[trackId];
        expect(restored).toBeDefined();
        expect(restored?.featureTracks.spectrogram.frameCount).toBe(10);
        expect(useTimelineStore.getState().audioFeatureCacheStatus[trackId]?.state).toBe('ready');
    });
});
