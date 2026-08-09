import { describe, expect, it } from 'vitest';
import { normalizePlaybackRange, normalizeTimelineRowHeight, normalizeTimelineView } from '../viewState';

describe('timeline view state', () => {
    it('normalizes reversed and zero-width ranges', () => {
        expect(normalizeTimelineView(20, 10)).toEqual({ startTick: 10, endTick: 20 });
        expect(normalizeTimelineView(5, 5)).toEqual({ startTick: 5, endTick: 6 });
        expect(normalizePlaybackRange(-2, 12)).toEqual({ startTick: 0, endTick: 12 });
        expect(normalizeTimelineRowHeight(999)).toBe(160);
    });
});
