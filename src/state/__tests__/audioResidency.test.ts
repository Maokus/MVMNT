import { beforeEach, describe, expect, it } from 'vitest';
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
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
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
});
