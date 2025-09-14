import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';

// Ensures toggling play/pause does not advance the playhead forward to a later bar boundary.

describe('play/pause no half-bar jump', () => {
    it('play then pause keeps tick stable (or snapped only backward)', () => {
        const api = useTimelineStore.getState();
        api.setQuantize('bar');
        api.setCurrentTick(730, 'user'); // between bar boundaries for 4/4 at 480 PPQ (bars every 1920 ticks)
        const before = useTimelineStore.getState().timeline.currentTick;
        api.play();
        const afterPlay = useTimelineStore.getState().timeline.currentTick;
        // After play we may snap DOWN to prior bar, but never up
        expect(afterPlay).toBeLessThanOrEqual(before);
        api.pause();
        const afterPause = useTimelineStore.getState().timeline.currentTick;
        expect(afterPause).toBe(afterPlay);
    });
});
