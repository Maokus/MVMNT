import { afterEach, describe, it, expect } from 'vitest';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { useTimelineStore } from '@state/timelineStore';
import { AudioEngine } from '@audio/audio-engine';

class MockAudioContext {
    public currentTime = 0;
    public state: AudioContextState = 'running';
    public startCalls = 0;
    resume = async () => {
        this.state = 'running';
    };
    createBufferSource(): any {
        return {
            connect: () => ({ connect: () => {} }),
            start: () => {
                this.startCalls += 1;
            },
            stop: () => {},
            onended: null as any,
            disconnect: () => {},
        };
    }
    createGain(): any {
        return { gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} }, connect: () => ({ connect: () => {} }), disconnect: () => {} };
    }
    get destination() {
        return {};
    }
}

function makeDecodedBuffer(): AudioBuffer {
    return {
        duration: 1,
        length: 44100,
        sampleRate: 44100,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(44100),
        copyFromChannel: () => {},
        copyToChannel: () => {},
    } as unknown as AudioBuffer;
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
}

afterEach(() => {
    useTimelineStore.getState().resetTimeline();
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
});

describe('AudioEngine + TransportCoordinator integration (mocked)', () => {
    it('falls back gracefully if audio engine not ready', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.play();
        let mockCtx: MockAudioContext | null = new MockAudioContext();
        const eng = new AudioEngine();
        // Forcefully set internal context for engine
        (eng as any).ctx = mockCtx as any;
        const tc = new TransportCoordinator({ getAudioContext: () => mockCtx as any, audioEngine: eng });
        tc.play(0);
        // Advance mock time
        mockCtx!.currentTime += 1.0; // 1 second
        const tick = tc.updateFrame(16.6);
        expect(typeof tick === 'number').toBe(true);
    });

    it('creates audio context on first play and switches to audio source', async () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        const eng = new AudioEngine();
        // Mock ensureContext to inject our MockAudioContext
        const mockCtx = new MockAudioContext();
        (eng as any).ensureContext = async () => {
            (eng as any).ctx = mockCtx as any;
            return mockCtx as any;
        };
        const tc = new TransportCoordinator({ audioEngine: eng });
        tc.play(0);
        expect(tc.getState().source).toBe('audio');
        mockCtx.currentTime += 0.5;
        tc.updateFrame(8.3);
        expect(tc.getState().lastDerivedTick).toBeGreaterThanOrEqual(0);
    });

    it('rehydrates restored audio sources on first playback', async () => {
        const api = useTimelineStore.getState();
        api.resetTimeline();
        api.setCurrentTick(0, 'user');
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                audio1: {
                    id: 'audio1',
                    name: 'Restored Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [{ id: 'clip1', type: 'audio', sourceId: 'audio1', offsetTicks: 0, enabled: true }],
                },
            },
            tracksOrder: ['audio1'],
            audioCache: {
                audio1: {
                    durationTicks: 960,
                    durationSeconds: 1,
                    durationSamples: 44100,
                    sampleRate: 44100,
                    channels: 1,
                    originalFile: {
                        name: 'restored.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        byteLength: 4,
                        storage: 'inline',
                    },
                    decodedState: 'failed',
                    decodedFailureReason: 'decoded buffer deferred until playback',
                },
            },
        }));
        useTimelineStore.getState().play();

        class DecodeAudioContext extends MockAudioContext {
            decodeAudioData = async () => makeDecodedBuffer();
            close = async () => {};
        }
        (window as any).AudioContext = DecodeAudioContext;

        const playbackCtx = new MockAudioContext();
        const eng = new AudioEngine();
        (eng as any).ctx = playbackCtx as any;

        await eng.playTick(0);
        await waitFor(() => playbackCtx.startCalls > 0);

        expect(useTimelineStore.getState().audioCache.audio1.audioBuffer).toBeDefined();
        expect(playbackCtx.startCalls).toBeGreaterThan(0);
    });
});
