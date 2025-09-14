import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';

/**
 * Tests for playheadAuthority ensuring writes from different domains behave predictably.
 */

describe('playheadAuthority precedence', () => {
    it('user tick scrub sets authority user and preserves tick until overridden', () => {
        const api = useTimelineStore.getState();
        api.pause();
        const start = api.timeline.currentTick;
        const target = start + 1234;
        api.setCurrentTick(target, 'user');
        const after = useTimelineStore.getState();
        expect(after.timeline.currentTick).toBe(target);
        expect(after.timeline.playheadAuthority).toBe('user');
    });

    // Removed legacy seconds authority path; seconds are derived only. Test retained authorities (user, clock).

    it('clock advance overrides user authority', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.setCurrentTick(500, 'clock');
        const s = useTimelineStore.getState();
        expect(s.timeline.currentTick).toBe(500);
        expect(s.timeline.playheadAuthority).toBe('clock');
    });
});
