import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';

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
});

describe('audio clip source persistence', () => {
    it('packages and restores audio referenced by clip source IDs', async () => {
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
});
