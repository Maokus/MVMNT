import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';
import type { ExportSceneResultInline, ExportSceneResultZip } from '@persistence/export';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { parseScenePackage } from '@persistence/scene-package';

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
            windowSize: 2048,
            hopSize: 512,
            overlap: 4,
            sampleRate: 44100,
            fftSize: 2048,
            minDecibels: -80,
            maxDecibels: 0,
            calculatorVersions: {
                'mvmnt.spectrogram': 2,
                'mvmnt.rms': 1,
            },
        },
        featureTracks: {
            spectrogram: {
                key: 'spectrogram',
                calculatorId: 'mvmnt.spectrogram',
                version: 2,
                frameCount,
                channels: 4,
                hopTicks,
                hopSeconds: 0.04,
                format: 'float32',
                data: Float32Array.from({ length: frameCount * 4 }, (_, idx) => idx / (frameCount * 4)),
                metadata: {
                    sampleRate: 44100,
                    fftSize: 2048,
                    minDecibels: -80,
                    maxDecibels: 0,
                },
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

async function exportZippedScene(): Promise<ExportSceneResultZip> {
    const result = await exportScene();
    if (!result.ok || result.mode !== 'zip-package') {
        throw new Error('Expected zip-package export result');
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
        expect(serialized.analysisParams.windowSize).toBe(2048);
        expect(serialized.featureTracks.spectrogram.metadata?.fftSize).toBe(2048);
        expect(serialized.featureTracks.spectrogram.metadata?.minDecibels).toBe(-80);
        useTimelineStore.getState().resetTimeline();
        const importResult = await importScene(exported.json);
        expect(importResult.ok).toBe(true);
        const restored = useTimelineStore.getState().audioFeatureCaches[trackId];
        expect(restored).toBeDefined();
        expect(restored?.featureTracks.spectrogram.frameCount).toBe(10);
        expect(useTimelineStore.getState().audioFeatureCacheStatus[trackId]?.state).toBe('ready');
    });

    it('stores audio feature caches and waveforms as external assets in packaged export', async () => {
        const trackId = 'aud_persist';
        const waveformPeaks = Float32Array.from({ length: 8 }, (_, idx) => (idx % 2 === 0 ? 0.5 : -0.5));
        const audioBufferStub = {
            duration: 1,
            length: 100,
            numberOfChannels: 1,
            sampleRate: 44100,
            copyFromChannel: () => undefined,
            copyToChannel: () => undefined,
            getChannelData: () => new Float32Array(100),
        } as unknown as AudioBuffer;
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
            audioCache: {
                ...state.audioCache,
                [trackId]: {
                    originalFile: {
                        name: 'persist.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([0, 1, 2, 3]),
                        byteLength: 4,
                        hash: 'placeholder',
                    },
                    durationSeconds: 1,
                    durationSamples: 100,
                    sampleRate: 44100,
                    channels: 1,
                    durationTicks: 100,
                    audioBuffer: audioBufferStub,
                    waveform: {
                        version: 1,
                        channelPeaks: waveformPeaks,
                        sampleStep: 256,
                    },
                },
            },
        }));

        const cache = createFeatureCache(trackId);
        useTimelineStore.getState().ingestAudioFeatureCache(trackId, cache);

        const exported = await exportZippedScene();
        const timelineSection = exported.envelope.timeline;
        const reference = timelineSection.audioFeatureCaches?.[trackId] as any;
        expect(reference).toBeDefined();
        expect(reference.assetId).toBe(encodeURIComponent(trackId));
        expect(reference.assetRef).toContain('assets/audio-features/');
        expect(reference.featureTracks).toBeUndefined();

        const assetId = exported.envelope.references?.audioIdMap?.[trackId];
        expect(assetId).toBeTruthy();
        const waveformRef = exported.envelope.assets.waveforms?.byAudioId?.[assetId!];
        expect(waveformRef).toMatchObject({ assetId, assetRef: expect.stringContaining('assets/waveforms/') });
        expect((waveformRef as any).channelPeaks).toBeUndefined();

        const parsed = parseScenePackage(exported.zip);
        expect(parsed.audioFeaturePayloads.get(encodeURIComponent(trackId))).toBeInstanceOf(Uint8Array);
        expect(parsed.waveformPayloads.get(assetId!)).toBeInstanceOf(Uint8Array);
    });
});
