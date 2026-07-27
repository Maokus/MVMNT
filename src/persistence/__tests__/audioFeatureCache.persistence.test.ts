import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';
import type { ExportSceneResultZip } from '@persistence/export';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { parseScenePackage } from '@persistence/scene-package';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '@audio/features/featureTrackIdentity';
import { deserializeAudioFeatureCache, serializeAudioFeatureCache } from '@audio/features/audioFeatureAnalysis';
import { unzipSync, zipSync } from 'fflate';

function createFeatureCache(sourceId: string): AudioFeatureCache {
    const frameCount = 10;
    const hopTicks = 120;
    const defaultProfile = DEFAULT_ANALYSIS_PROFILE_ID;
    const spectrogramKey = buildFeatureTrackKey('spectrogram', defaultProfile);
    return {
        version: 4,
        audioSourceId: sourceId,
        hopSeconds: 0.04,
        hopTicks,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
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
                'mvmnt.spectrogram': 3,
                'mvmnt.rms': 1,
            },
        },
        featureTracks: {
            [spectrogramKey]: {
                key: spectrogramKey,
                calculatorId: 'mvmnt.spectrogram',
                version: 3,
                frameCount,
                channels: 4,
                hopTicks,
                hopSeconds: 0.04,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data: Float32Array.from({ length: frameCount * 4 }, (_, idx) => idx / (frameCount * 4)),
                metadata: {
                    sampleRate: 44100,
                    fftSize: 2048,
                    minDecibels: -80,
                    maxDecibels: 0,
                },
                channelLayout: { aliases: ['Left', 'Right', 'Center', 'LFE'], semantics: 'surround' },
            },
        },
    };
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
                    clips: [{ id: `${trackId}__audio_clip`, type: 'audio', sourceId: trackId, offsetTicks: 0 }],
                    gain: 1,
                },
            },
            tracksOrder: [trackId],
        }));
        const cache = createFeatureCache(trackId);
        useTimelineStore.getState().ingestAudioFeatureCache(trackId, cache);
        const serialized = serializeAudioFeatureCache(cache);
        expect(serialized.version).toBe(4);
        expect(serialized.startTimeSeconds).toBe(0);
        expect(serialized.tempoProjection?.hopTicks).toBe(120);
        expect(serialized.analysisParams.windowSize).toBe(2048);
        const serializedSpectrogramKey = buildFeatureTrackKey(
            'spectrogram',
            serialized.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID
        );
        expect(serialized.featureTracks[serializedSpectrogramKey].startTimeSeconds).toBe(0);
        expect(serialized.featureTracks[serializedSpectrogramKey].metadata?.fftSize).toBe(2048);
        expect(serialized.featureTracks[serializedSpectrogramKey].metadata?.minDecibels).toBe(-80);
        expect(serialized.featureTracks[serializedSpectrogramKey].channelLayout?.aliases).toEqual([
            'Left',
            'Right',
            'Center',
            'LFE',
        ]);
        expect('channelAliases' in serialized).toBe(false);
        expect('channelAliases' in serialized.featureTracks[serializedSpectrogramKey]).toBe(false);
        const restored = deserializeAudioFeatureCache(serialized);
        expect(restored).toBeDefined();
        const restoredSpectrogramKey = buildFeatureTrackKey(
            'spectrogram',
            restored?.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID
        );
        expect(restored?.featureTracks[restoredSpectrogramKey]?.frameCount).toBe(10);
        expect(restored?.featureTracks[restoredSpectrogramKey]?.channelLayout?.aliases).toEqual([
            'Left',
            'Right',
            'Center',
            'LFE',
        ]);
        expect(restored?.tempoProjection?.hopTicks).toBe(120);
    });

    it('reads V3 aliases into channelLayout and re-emits a V4-only shape', () => {
        const cache = createFeatureCache('legacy-source');
        const legacy: any = serializeAudioFeatureCache(cache);
        legacy.version = 3;
        legacy.channelAliases = ['Left', 'Right'];
        delete legacy.channelLayout;
        const key = Object.keys(legacy.featureTracks)[0];
        legacy.featureTracks[key].channelAliases = ['Mid', 'Side'];
        delete legacy.featureTracks[key].channelLayout;

        const restored = deserializeAudioFeatureCache(legacy);
        expect(restored.channelLayout?.aliases).toEqual(['Left', 'Right']);
        expect(restored.featureTracks[key].channelLayout?.aliases).toEqual(['Mid', 'Side']);

        const upgraded: any = serializeAudioFeatureCache(restored);
        expect(upgraded.version).toBe(4);
        expect(upgraded.channelAliases).toBeUndefined();
        expect(upgraded.featureTracks[key].channelAliases).toBeUndefined();
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
                    clips: [{ id: `${trackId}__audio_clip`, type: 'audio', sourceId: trackId, offsetTicks: 0 }],
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
        const featurePayloads = parsed.audioFeaturePayloads.get(encodeURIComponent(trackId));
        expect(featurePayloads).toBeInstanceOf(Map);
        expect(featurePayloads?.get('feature_caches.json')).toBeInstanceOf(Uint8Array);
        const featureBinaryKeys = featurePayloads
            ? Array.from(featurePayloads.keys()).filter((key) => key !== 'feature_caches.json')
            : [];
        expect(featureBinaryKeys.length).toBeGreaterThan(0);
        for (const key of featureBinaryKeys) {
            expect(featurePayloads?.get(key)).toBeInstanceOf(Uint8Array);
        }

        const waveformPayloads = parsed.waveformPayloads.get(assetId!);
        expect(waveformPayloads).toBeInstanceOf(Map);
        expect(waveformPayloads?.get('waveform.json')).toBeInstanceOf(Uint8Array);
        expect(waveformPayloads?.get('waveform.f32')).toBeInstanceOf(Uint8Array);
    });

    it('restores ready caches without re-triggering audio analysis on import', async () => {
        const trackId = 'aud_ready';
        const waveformPeaks = Float32Array.from({ length: 4 }, () => 0.25);
        const audioBufferStub = {
            duration: 2,
            length: 200,
            numberOfChannels: 1,
            sampleRate: 44100,
            copyFromChannel: () => undefined,
            copyToChannel: () => undefined,
            getChannelData: () => new Float32Array(200),
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
                    clips: [{ id: `${trackId}__audio_clip`, type: 'audio', sourceId: trackId, offsetTicks: 0 }],
                    gain: 1,
                },
            },
            tracksOrder: [trackId],
            audioCache: {
                ...state.audioCache,
                [trackId]: {
                    originalFile: {
                        name: 'ready.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([4, 5, 6]),
                        byteLength: 3,
                        hash: 'ready-hash',
                    },
                    durationSeconds: 2,
                    durationSamples: 200,
                    sampleRate: 44100,
                    channels: 1,
                    audioBuffer: audioBufferStub,
                    waveform: {
                        version: 1,
                        channelPeaks: waveformPeaks,
                        sampleStep: 128,
                    },
                },
            },
        }));

        const cache = createFeatureCache(trackId);
        useTimelineStore.getState().ingestAudioFeatureCache(trackId, cache);

        const exported = await exportZippedScene();

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const result = await importScene(exported.zip);
        expect(result.ok).toBe(true);

        const status = useTimelineStore.getState().audioFeatureCacheStatus[trackId];
        expect(status?.state).toBe('ready');
        expect(status?.message).toBeUndefined();
    });

    it('marks a cache stale instead of retaining a truncated spectrogram after restore', async () => {
        const trackId = 'aud_truncated';
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                [trackId]: {
                    id: trackId,
                    name: 'Truncated cache',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [{ id: `${trackId}__audio_clip`, type: 'audio', sourceId: trackId, offsetTicks: 0 }],
                    gain: 1,
                },
            },
            tracksOrder: [trackId],
            audioFeatureCaches: { [trackId]: createFeatureCache(trackId) },
            audioFeatureCacheStatus: { [trackId]: { state: 'ready', updatedAt: 1 } },
        }));
        const exported = await exportZippedScene();
        const archive = unzipSync(exported.zip);
        const payloadPath = Object.keys(archive).find(
            (path) => path.startsWith('assets/audio-features/') && path.endsWith('.f32')
        );
        expect(payloadPath).toBeDefined();
        archive[payloadPath!] = archive[payloadPath!]!.slice(0, -4);

        useTimelineStore.getState().resetTimeline();
        const imported = await importScene(zipSync(archive));

        expect(imported.ok).toBe(true);
        expect(useTimelineStore.getState().audioFeatureCacheStatus[trackId]).toMatchObject({
            state: 'stale',
            message: 'analysis cache incomplete after restore',
        });
        expect(useTimelineStore.getState().audioFeatureCaches[trackId]?.featureTracks).toEqual({});
    });
});
