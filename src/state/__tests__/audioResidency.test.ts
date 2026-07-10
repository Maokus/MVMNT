import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

function makeBuffer(length = 100): AudioBuffer {
    return {
        length,
        numberOfChannels: 2,
        duration: 1,
        sampleRate: 100,
        getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
}

describe('audio decoded residency', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
    });

    it('evicts decoded buffers for inactive referenced sources while keeping metadata', () => {
        useTimelineStore.setState({
            tracks: {
                audio1: {
                    id: 'audio1',
                    name: 'Audio 1',
                    type: 'audio',
                    enabled: false,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                    audioSourceId: 'audio1',
                },
            },
            tracksOrder: ['audio1'],
            audioCache: {
                audio1: {
                    audioBuffer: makeBuffer(),
                    durationTicks: 960,
                    sampleRate: 100,
                    channels: 2,
                    durationSeconds: 1,
                    durationSamples: 100,
                    originalFile: {
                        mimeType: 'audio/wav',
                        byteLength: 4,
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        storage: 'inline',
                    },
                    decodedState: 'ready',
                },
            },
        } as any);

        const evicted = useTimelineStore.getState().evictDecodedAudioBuffers();
        const entry = useTimelineStore.getState().audioCache.audio1;

        expect(evicted).toBe(1);
        expect(entry.audioBuffer).toBeUndefined();
        expect(entry.decodedState).toBe('evicted');
        expect(entry.durationTicks).toBe(960);
        expect(entry.originalFile?.byteLength).toBe(4);
    });

    it('does not evict active audible sources', () => {
        useTimelineStore.setState({
            tracks: {
                audio1: {
                    id: 'audio1',
                    name: 'Audio 1',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                    audioSourceId: 'audio1',
                },
            },
            tracksOrder: ['audio1'],
            audioCache: {
                audio1: {
                    audioBuffer: makeBuffer(),
                    durationTicks: 960,
                    sampleRate: 100,
                    channels: 2,
                    durationSeconds: 1,
                    durationSamples: 100,
                    originalFile: {
                        mimeType: 'audio/wav',
                        byteLength: 4,
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        storage: 'inline',
                    },
                    decodedState: 'ready',
                },
            },
        } as any);

        const evicted = useTimelineStore.getState().evictDecodedAudioBuffers();

        expect(evicted).toBe(0);
        expect(useTimelineStore.getState().audioCache.audio1.audioBuffer).toBeDefined();
    });
});
