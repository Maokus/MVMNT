import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';
import { LocalSaveService } from '@persistence/local-save-service';
import { LocalFileStore } from '@persistence/local-file-store';

function makeAudioBufferStub(): AudioBuffer {
    return {
        duration: 1,
        length: 100,
        numberOfChannels: 1,
        sampleRate: 44100,
        copyFromChannel: () => undefined,
        copyToChannel: () => undefined,
        getChannelData: () => new Float32Array(100),
    } as unknown as AudioBuffer;
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
    }));
    return LocalFileStore.clear();
});

function setSceneWithClipAudioSource() {
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {
            audioTrack1: {
                id: 'audioTrack1',
                name: 'Audio Track',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [
                    {
                        id: 'clip1',
                        type: 'audio',
                        sourceId: 'source1',
                        offsetTicks: 0,
                        enabled: true,
                    },
                ],
            },
        },
        tracksOrder: ['audioTrack1'],
        audioCache: {
            source1: {
                audioBuffer: makeAudioBufferStub(),
                durationTicks: 960,
                durationSeconds: 1,
                durationSamples: 100,
                sampleRate: 44100,
                channels: 1,
                originalFile: {
                    name: 'clip-source.wav',
                    mimeType: 'audio/wav',
                    bytes: new Uint8Array([1, 2, 3, 4]),
                    byteLength: 4,
                },
            },
        },
    }));
}

describe('audio clip source persistence', () => {
    it('packages and restores audio referenced by clip source IDs', async () => {
        setSceneWithClipAudioSource();

        const exported = await exportScene();
        expect(exported.ok).toBe(true);
        if (!exported.ok || exported.mode !== 'zip-package') {
            throw new Error('Expected packaged scene export');
        }
        expect(exported.envelope.references?.audioIdMap.source1).toBeDefined();
        expect(exported.envelope.references?.audioIdMap.audioTrack1).toBeUndefined();

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const imported = await importScene(exported.zip);
        expect(imported.ok).toBe(true);

        const state = useTimelineStore.getState();
        expect(state.audioCache.source1).toBeDefined();
        expect(state.audioCache.source1.originalFile?.byteLength).toBe(4);
        expect(state.tracks.audioTrack1?.type).toBe('audio');
        expect(state.tracks.source1).toBeUndefined();
        expect((state.tracks.audioTrack1 as any).clips?.[0]?.sourceId).toBe('source1');
    });

    it('restores clip audio through the local save service path', async () => {
        setSceneWithClipAudioSource();

        const saved = await LocalSaveService.saveCurrentFile('Local Audio Scene');
        expect(saved.ok).toBe(true);

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const loaded = await LocalSaveService.loadSavedFile();
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) {
            throw new Error(loaded.error);
        }
        expect(loaded.loaded).toBe(true);

        const state = useTimelineStore.getState();
        expect(state.audioCache.source1).toBeDefined();
        expect(state.audioCache.source1.originalFile?.byteLength).toBe(4);
        expect((state.tracks.audioTrack1 as any).clips?.[0]?.sourceId).toBe('source1');
    });

    it('keeps restored audio bytes when startup decode is deferred', async () => {
        setSceneWithClipAudioSource();
        const exported = await exportScene();
        if (!exported.ok || exported.mode !== 'zip-package') {
            throw new Error('Expected packaged scene export');
        }

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const previousAudioContext = (window as any).AudioContext;
        class FailingAudioContext {
            decodeAudioData = async () => {
                throw new Error('decode blocked during startup');
            };
            close = async () => {};
        }
        (window as any).AudioContext = FailingAudioContext;
        try {
            const imported = await importScene(exported.zip);
            expect(imported.ok).toBe(true);
        } finally {
            if (previousAudioContext) {
                (window as any).AudioContext = previousAudioContext;
            } else {
                delete (window as any).AudioContext;
            }
        }

        const entry = useTimelineStore.getState().audioCache.source1;
        expect(entry).toBeDefined();
        expect(entry.audioBuffer).toBeUndefined();
        expect(entry.originalFile?.byteLength).toBe(4);
        expect(entry.decodedState).toBe('failed');
    });

    it('infers missing audioIdMap entries from timeline audio references', async () => {
        setSceneWithClipAudioSource();
        const exported = await exportScene();
        if (!exported.ok || exported.mode !== 'zip-package') {
            throw new Error('Expected packaged scene export');
        }
        delete (exported.envelope as any).references;
        const { zipSync, strToU8, unzipSync } = await import('fflate');
        const archive = unzipSync(exported.zip);
        archive['document.json'] = strToU8(JSON.stringify(exported.envelope));
        const legacyZip = zipSync(archive);

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const imported = await importScene(legacyZip);
        expect(imported.ok).toBe(true);
        expect(useTimelineStore.getState().audioCache.source1).toBeDefined();

        const savedAgain = await exportScene();
        expect(savedAgain.ok).toBe(true);
        if (!savedAgain.ok) return;
        expect(savedAgain.warnings.some((warning) => warning.includes('Audio cache entries missing'))).toBe(false);
    });

    it('repairs a single unreferenced audio cache alias while saving', async () => {
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                audioTrack1: {
                    id: 'audioTrack1',
                    name: 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [{ id: 'clip1', type: 'audio', sourceId: 'source1', offsetTicks: 0, enabled: true }],
                },
            },
            tracksOrder: ['audioTrack1'],
            audioCache: {
                assetHashOnly: {
                    audioBuffer: makeAudioBufferStub(),
                    durationTicks: 960,
                    durationSeconds: 1,
                    durationSamples: 100,
                    sampleRate: 44100,
                    channels: 1,
                    originalFile: {
                        name: 'alias.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([9, 8, 7, 6]),
                        byteLength: 4,
                    },
                },
            },
        }));

        const exported = await exportScene();
        expect(exported.ok).toBe(true);
        if (!exported.ok) return;
        expect(exported.warnings.some((warning) => warning.includes('Audio cache entries missing'))).toBe(false);
        expect(exported.envelope.references?.audioIdMap.source1).toBeDefined();
    });

    it('repairs clip sources from track audioSourceId aliases when saving multiple audio tracks', async () => {
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                audioTrack1: {
                    id: 'audioTrack1',
                    name: 'Audio Track 1',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    audioSourceId: 'cacheA',
                    clips: [{ id: 'clip1', type: 'audio', sourceId: 'source1', offsetTicks: 0, enabled: true }],
                },
                audioTrack2: {
                    id: 'audioTrack2',
                    name: 'Audio Track 2',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    audioSourceId: 'cacheB',
                    clips: [{ id: 'clip2', type: 'audio', sourceId: 'source2', offsetTicks: 0, enabled: true }],
                },
            },
            tracksOrder: ['audioTrack1', 'audioTrack2'],
            audioCache: {
                cacheA: {
                    audioBuffer: makeAudioBufferStub(),
                    durationTicks: 960,
                    durationSeconds: 1,
                    durationSamples: 100,
                    sampleRate: 44100,
                    channels: 1,
                    originalFile: {
                        name: 'first.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        byteLength: 4,
                    },
                },
                cacheB: {
                    audioBuffer: makeAudioBufferStub(),
                    durationTicks: 960,
                    durationSeconds: 1,
                    durationSamples: 100,
                    sampleRate: 44100,
                    channels: 1,
                    originalFile: {
                        name: 'second.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([5, 6, 7, 8]),
                        byteLength: 4,
                    },
                },
            },
        }));

        const saved = await LocalSaveService.saveCurrentFile('Multi Audio Scene');
        expect(saved.ok).toBe(true);

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));

        const loaded = await LocalSaveService.loadSavedFile();
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) {
            throw new Error(loaded.error);
        }
        expect(loaded.loaded).toBe(true);

        const state = useTimelineStore.getState();
        expect(state.audioCache.source1.originalFile?.byteLength).toBe(4);
        expect(state.audioCache.source2.originalFile?.byteLength).toBe(4);
        expect((state.tracks.audioTrack1 as any).clips?.[0]?.sourceId).toBe('source1');
        expect((state.tracks.audioTrack2 as any).clips?.[0]?.sourceId).toBe('source2');
    });
});
