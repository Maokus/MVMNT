import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';

// Ensures toggling play/pause does not advance the playhead forward to a later bar boundary.

describe('play/pause no half-bar jump', () => {
    it('play then pause keeps tick stable (or snapped only backward)', () => {
        const api = useTimelineStore.getState();
        api.setQuantize('bar');
        // Choose a tick between bar boundaries for 4/4. Using ~0.76 of a bar relative to canonical PPQ.
        const barTicks = 4 * CANONICAL_PPQ;
        const midTick = Math.round(0.76 * barTicks);
        api.setCurrentTick(midTick, 'user');
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
