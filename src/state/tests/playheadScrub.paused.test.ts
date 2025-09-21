import { act } from 'react-dom/test-utils';
import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '../timelineStore';

// Lightweight test: ensure that calling setCurrentTick while transport paused persists the tick value
// (regression guard for scrub-being-reverted issue)

describe('playhead scrub while paused', () => {
    it('retains tick after setCurrentTick', () => {
        const api = useTimelineStore.getState();
        // Ensure paused
        if (api.transport.isPlaying) api.pause();
        const start = api.timeline.currentTick;
        const target = start + CANONICAL_PPQ * 4; // advance 4 beats relative to canonical PPQ
        act(() => {
            api.setCurrentTick(target);
        });
        const after = useTimelineStore.getState().timeline.currentTick;
        expect(after).toBe(target);
    });
});
