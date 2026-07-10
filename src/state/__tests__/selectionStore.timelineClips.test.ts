import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../selectionStore';

describe('selectionStore timeline clip selection', () => {
    beforeEach(() => {
        useSelectionStore.getState().clearSelection();
    });

    it('stores selected timeline clips as their own active target', () => {
        useSelectionStore.getState().selectTimelineClips([{ trackId: 'track-a', clipId: 'clip-a' }]);

        const state = useSelectionStore.getState();
        expect(state.activeTarget).toBe('timelineClips');
        expect(state.selectedTimelineClips).toEqual([{ trackId: 'track-a', clipId: 'clip-a' }]);
        expect(state.selectedTrackIds).toEqual([]);
    });

    it('stores point and range clip timeline selections separately from clips', () => {
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
        expect(useSelectionStore.getState().selectedTimelineClips).toEqual([]);
    });
});
