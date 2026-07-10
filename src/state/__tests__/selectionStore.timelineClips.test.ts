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

    it('stores explicit clip list selection', () => {
        useSelectionStore.getState().selectClipTimeline({
            type: 'clips',
            clips: [
                { trackId: 'track-a', clipId: 'clip-1' },
                { trackId: 'track-c', clipId: 'clip-5' },
            ],
        });

        expect(useSelectionStore.getState().activeTarget).toBe('clipTimeline');
        expect(useSelectionStore.getState().clipTimelineSelection).toEqual({
            type: 'clips',
            clips: [
                { trackId: 'track-a', clipId: 'clip-1' },
                { trackId: 'track-c', clipId: 'clip-5' },
            ],
        });
    });

    it('clips selection on different tracks does not create an implicit range', () => {
        useSelectionStore.getState().selectClipTimeline({
            type: 'clips',
            clips: [
                { trackId: 'track-a', clipId: 'clip-1' },
                { trackId: 'track-c', clipId: 'clip-5' },
            ],
        });

        const sel = useSelectionStore.getState().clipTimelineSelection;
        // Should be type 'clips', not 'range'
        expect(sel?.type).toBe('clips');
    });

    it('clearing selection removes clips type selection', () => {
        useSelectionStore.getState().selectClipTimeline({
            type: 'clips',
            clips: [{ trackId: 'track-a', clipId: 'clip-1' }],
        });

        useSelectionStore.getState().clearSelection('clipTimeline');

        expect(useSelectionStore.getState().clipTimelineSelection).toBeNull();
        expect(useSelectionStore.getState().activeTarget).toBe('none');
    });
});
