import { describe, it, expect } from 'vitest';
import { alignAcrossTracks, mapTimelineToTrackSeconds } from '../timeline-helpers';

describe('timeline-helpers (Phase 1)', () => {
    it('maps timeline to track seconds with offset', () => {
        expect(mapTimelineToTrackSeconds({ offsetSec: 2 }, 5)).toBe(3);
        expect(mapTimelineToTrackSeconds({ offsetSec: 10 }, 5)).toBe(null);
    });

    it('aligns time across tracks by offsets', () => {
        const state: any = {
            tracks: {
                a: { id: 'a', type: 'midi', name: 'A', enabled: true, mute: false, solo: false, offsetSec: 2 },
                b: { id: 'b', type: 'midi', name: 'B', enabled: true, mute: false, solo: false, offsetSec: 5 },
            },
        };
        // time 1s in A -> timeline 3 -> B local -2
        expect(alignAcrossTracks(state, { fromTrackId: 'a', toTrackId: 'b', timeInFromTrack: 1 })).toBe(-2);
    });
});
