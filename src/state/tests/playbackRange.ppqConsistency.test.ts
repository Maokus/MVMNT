import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

/**
 * Regression: entering a scene end value of e.g. 20 seconds previously doubled to 40 because
 * UI used 960 while core conversions used 480. This test asserts round-trip consistency.
 */

describe('playback range PPQ consistency', () => {
    it('seconds -> ticks -> seconds round trip within 1ms', () => {
        const api = useTimelineStore.getState();
        // Simulate user entering start/end seconds via legacy API (setPlaybackRangeExplicit)
        const startSec = 5;
        const endSec = 20; // critical value previously doubled
        api.setPlaybackRangeExplicit(startSec, endSec);
        const s = useTimelineStore.getState();
        const pr: any = s.playbackRange;
        expect(pr).toBeTruthy();
        // Derived seconds are injected by subscribe shim; ensure they match inputs closely
        const derivedStart = pr.startSec;
        const derivedEnd = pr.endSec;
        expect(Math.abs((derivedStart ?? 0) - startSec)).toBeLessThan(0.001);
        expect(Math.abs((derivedEnd ?? 0) - endSec)).toBeLessThan(0.001);
    });
});
