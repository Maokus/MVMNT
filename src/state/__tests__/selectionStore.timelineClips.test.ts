import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../selectionStore';

describe('selectionStore timeline clip selection', () => {
    beforeEach(() => {
        useSelectionStore.getState().clearSelection();
    });

    it('stores point and range clip timeline selections as the clip-view selection target', () => {
        useSelectionStore.getState().selectClipTimeline({
            type: 'point',
            point: { trackId: 'track-a', tick: 480 },
        });

        expect(useSelectionStore.getState().activeTarget).toBe('clipTimeline');
        expect(useSelectionStore.getState().clipTimelineSelection).toEqual({
            type: 'point',
            point: { trackId: 'track-a', tick: 480 },
        });

        useSelectionStore.getState().selectClipTimeline({
            type: 'range',
            range: { startTick: 240, endTick: 960, trackIds: ['track-a', 'track-b'] },
        });

        expect(useSelectionStore.getState().clipTimelineSelection).toEqual({
            type: 'range',
            range: { startTick: 240, endTick: 960, trackIds: ['track-a', 'track-b'] },
        });
    });
});
