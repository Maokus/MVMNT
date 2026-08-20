import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAX_AUDIO_FEATURE_CACHE_BYTES, exportScene } from '@persistence/export';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { publishAnalysisIntent, resetAnalysisIntentStateForTests } from '@audio/features/analysisIntents';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';

function makeBuffer(): AudioBuffer {
    return {
        length: 100,
        numberOfChannels: 1,
        duration: 1,
        sampleRate: 100,
        getChannelData: () => new Float32Array(100),
    } as unknown as AudioBuffer;
}

function makeFeatureCache(sourceId: string): AudioFeatureCache {
    return {
        version: 3,
        audioSourceId: sourceId,
        hopSeconds: 0.1,
        startTimeSeconds: 0,
        frameCount: 4,
        featureTracks: {
            spectrogram: {
                key: 'spectrogram',
                calculatorId: 'test.spectrogram',
                version: 1,
                frameCount: 4,
                channels: 1,
                hopSeconds: 0.1,
                startTimeSeconds: 0,
                data: new Float32Array([1, 2, 3, 4]),
                format: 'float32',
                analysisProfileId: 'default',
            },
        },
        analysisParams: {
            windowSize: 512,
            hopSize: 256,
            overlap: 2,
            sampleRate: 100,
            calculatorVersions: { 'test.spectrogram': 1 },
        },
        defaultAnalysisProfileId: 'default',
    };
}

describe('large feature cache export', () => {
    beforeEach(() => {
        resetAnalysisIntentStateForTests();
        useTimelineStore.getState().resetTimeline();
    });

    it('uses a 512 MiB default export cap', () => {
        expect(DEFAULT_MAX_AUDIO_FEATURE_CACHE_BYTES).toBe(512 * 1024 * 1024);
    });

    it('omits feature caches above the configured export cap and marks them stale', async () => {
        useTimelineStore.setState({
            tracks: {
                audio1: {
                    id: 'audio1',
                    name: 'Audio 1',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [{ id: 'clip-audio1', type: 'audio', sourceId: 'audio1', offsetTicks: 0 }],
                    gain: 1,
                },
            },
            tracksOrder: ['audio1'],
            audioCache: {
                audio1: {
                    audioBuffer: makeBuffer(),
                    sampleRate: 100,
                    channels: 1,
                    durationSeconds: 1,
                    durationSamples: 100,
                    originalFile: {
                        mimeType: 'audio/wav',
                        byteLength: 4,
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        storage: 'inline',
                    },
                },
            },
            audioFeatureCaches: {
                audio1: makeFeatureCache('audio1'),
            },
            audioFeatureCacheStatus: {
                audio1: { state: 'ready', updatedAt: 1 },
            },
        } as any);
        const descriptor = createFeatureDescriptor({ feature: 'spectrogram' });
        publishAnalysisIntent(
            'element-1::audio-feature::spectrogram',
            'audioSpectrogram',
            'audio1',
            [descriptor.descriptor],
            {
                ownerElementId: 'element-1',
                requestId: 'spectrogram',
                declarative: true,
            }
        );

        const result = await exportScene(undefined, { maxAudioFeatureCacheBytes: 1 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.warnings.some((warning) => warning.includes('Skipped 1 large audio analysis cache'))).toBe(true);
        expect(result.envelope.timeline.audioFeatureCaches).toBeUndefined();
        expect(result.envelope.timeline.audioFeatureCacheStatus?.audio1?.state).toBe('stale');
        expect(result.envelope.timeline.audioFeatureDemands).toHaveLength(1);
    });
});
