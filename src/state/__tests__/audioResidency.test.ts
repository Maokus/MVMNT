import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { createPatchUndoController } from '@state/undo';

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
    const originalAudioContext = (window as any).AudioContext;

    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
    });

    afterEach(() => {
        (window as any).AudioContext = originalAudioContext;
        vi.restoreAllMocks();
    });

    it('redoing an audio track add restores source metadata without pinning the decoded buffer', async () => {
        const controller = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        const result = await timelineCommandGateway.dispatchById<{ trackId: string }>('timeline.addTrack', {
            type: 'audio',
            name: 'Undoable Audio',
            buffer: makeBuffer(),
        });
        const trackId = result.result?.trackId ?? '';
        expect(useTimelineStore.getState().audioCache[trackId].audioBuffer).toBeDefined();

        controller.undo();
        expect(useTimelineStore.getState().audioCache[trackId]).toBeUndefined();

        controller.redo();
        const restored = useTimelineStore.getState().audioCache[trackId];
        expect(restored).toBeDefined();
        expect(restored.audioBuffer).toBeUndefined();
        expect(restored.decodedState).toBe('failed');
        expect(restored.decodedFailureReason).toBe('decoded buffer omitted from undo payload');
        controller.dispose();
    });

    it('does not resurrect an audio cache entry when rehydrate fails after timeline reset', async () => {
        let rejectDecode: ((error: Error) => void) | undefined;
        const close = vi.fn();
        (window as any).AudioContext = vi.fn(() => ({
            decodeAudioData: () =>
                new Promise<AudioBuffer>((_resolve, reject) => {
                    rejectDecode = reject;
                }),
            close,
        }));

        useTimelineStore.setState((state) => ({
            ...state,
            audioCache: {
                staleSource: {
                    durationTicks: 960,
                    durationSeconds: 1,
                    durationSamples: 100,
                    sampleRate: 44100,
                    channels: 1,
                    originalFile: {
                        name: 'stale.wav',
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        byteLength: 4,
                    },
                    decodedState: 'failed',
                },
            },
        }));

        const pending = useTimelineStore.getState().rehydrateAudioSource('staleSource');
        expect(useTimelineStore.getState().audioCache.staleSource?.decodedState).toBe('decoding');

        useTimelineStore.getState().resetTimeline();
        rejectDecode?.(new Error('decode failed after reset'));

        await expect(pending).resolves.toBe(false);
        expect(useTimelineStore.getState().audioCache.staleSource).toBeUndefined();
        expect(close).toHaveBeenCalled();
    });
});
