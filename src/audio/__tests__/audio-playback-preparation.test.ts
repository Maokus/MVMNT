import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '@audio/audio-engine';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { useTimelineStore } from '@state/timelineStore';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

class PlaybackContext {
    currentTime = 0;
    state = 'running';
    destination = {};
    sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createBufferSource() {
        const source = {
            buffer: null,
            start: vi.fn(),
            stop: vi.fn(),
            connect: vi.fn().mockReturnValue({ connect: vi.fn() }),
            disconnect: vi.fn(),
            onended: null,
        };
        this.sources.push(source);
        return source;
    }
    createGain() {
        return {
            gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            disconnect: vi.fn(),
        };
    }
}

describe('playback while audio is preparing', () => {
    let engine: AudioEngine;
    let coordinator: TransportCoordinator;
    let context: PlaybackContext;
    let preparation: ReturnType<typeof deferred<boolean>>;
    let buffer: AudioBuffer;
    let sourceId: string;

    beforeEach(async () => {
        useTimelineStore.getState().resetTimeline();
        buffer = {
            duration: 240,
            length: 240,
            sampleRate: 1,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(240),
            copyFromChannel: vi.fn(),
            copyToChannel: vi.fn(),
        } as AudioBuffer;
        const trackId = await useTimelineStore.getState().addAudioTrack({ name: 'Long audio', buffer });
        sourceId = (useTimelineStore.getState().tracks[trackId] as any).clips[0].sourceId;
        useTimelineStore.setState((state) => ({
            audioCache: {
                ...state.audioCache,
                [sourceId]: { ...state.audioCache[sourceId], audioBuffer: undefined, decodedState: 'decoding' },
            },
        }));
        preparation = deferred<boolean>();
        vi.spyOn(useTimelineStore.getState(), 'rehydrateAudioSource').mockReturnValue(preparation.promise);
        context = new PlaybackContext();
        vi.stubGlobal(
            'AudioContext',
            class {
                constructor() {
                    return context;
                }
            }
        );
        engine = new AudioEngine();
        coordinator = new TransportCoordinator({ audioEngine: engine });
    });

    afterEach(() => {
        coordinator.dispose();
        engine.dispose();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        useTimelineStore.getState().resetTimeline();
    });

    async function finishPreparation() {
        useTimelineStore.setState((state) => ({
            audioCache: {
                ...state.audioCache,
                [sourceId]: { ...state.audioCache[sourceId], audioBuffer: buffer, decodedState: 'ready' },
            },
        }));
        preparation.resolve(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    it.each(['pause', 'new project', 'dispose'] as const)('cancels pending playback on %s', async (action) => {
        useTimelineStore.getState().play();
        await Promise.resolve();
        if (action === 'pause') useTimelineStore.getState().pause();
        if (action === 'new project') useTimelineStore.getState().resetTimeline();
        if (action === 'dispose') engine.dispose();
        await finishPreparation();
        expect(context.sources).toHaveLength(0);
    });

    it('starts only the latest play request and stops every source after repeated toggles', async () => {
        for (let i = 0; i < 9; i += 1) {
            useTimelineStore.getState().togglePlay();
            await Promise.resolve();
        }
        await finishPreparation();
        expect(context.sources).toHaveLength(1);
        useTimelineStore.getState().pause();
        expect(context.sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    });

    it('keeps only the latest seek while preparation is pending', async () => {
        useTimelineStore.getState().play();
        await Promise.resolve();
        coordinator.seek(960);
        coordinator.seek(1920);
        await finishPreparation();
        expect(context.sources).toHaveLength(1);
        expect(context.sources[0].start.mock.calls[0][0]).toBe(0);
        expect(context.sources[0].start.mock.calls[0][1]).toBeCloseTo(1);
        expect(context.sources[0].start.mock.calls[0][2]).toBeCloseTo(239);
        useTimelineStore.getState().pause();
        expect(context.sources[0].stop).toHaveBeenCalledOnce();
    });

    it('aligns prepared audio with elapsed transport time', async () => {
        useTimelineStore.getState().play();
        await Promise.resolve();
        context.currentTime = 5;
        await finishPreparation();
        expect(context.sources).toHaveLength(1);
        expect(context.sources[0].start).toHaveBeenCalledWith(5, 5, 235);
    });

    it('cancels pending seeks when playback stops', async () => {
        useTimelineStore.getState().play();
        await Promise.resolve();
        coordinator.seek(1920);
        useTimelineStore.getState().pause();
        await finishPreparation();
        expect(context.sources).toHaveLength(0);
    });

    it('cancels playback stopped before context initialization completes', async () => {
        useTimelineStore.getState().play();
        useTimelineStore.getState().pause();
        await finishPreparation();
        expect(context.sources).toHaveLength(0);
    });

    it('cancels a play request while the audio context is resuming', async () => {
        // Use decoded audio here to isolate the other asynchronous start boundary.
        await finishPreparation();
        const resumed = deferred<void>();
        context.state = 'suspended';
        context.resume.mockReturnValue(resumed.promise);
        useTimelineStore.getState().play();
        await Promise.resolve();
        useTimelineStore.getState().pause();
        resumed.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(context.sources).toHaveLength(0);
    });
});
