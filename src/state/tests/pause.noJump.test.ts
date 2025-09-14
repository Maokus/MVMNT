import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

/** Ensures pausing playback does not quantize or move the playhead forward by a bar. */

describe('pause no jump', () => {
    it('pause leaves tick unchanged', () => {
        const api = useTimelineStore.getState();
        api.setQuantize('bar');
        api.setCurrentTick(1234, 'user'); // arbitrary non-aligned tick
        api.play();
        // On play, tick may snap to bar boundary (expected) but record it after start
        const afterPlay = useTimelineStore.getState().timeline.currentTick;
        api.pause();
        const afterPause = useTimelineStore.getState().timeline.currentTick;
        expect(afterPause).toBe(afterPlay); // no movement on pause
    });
});
