import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../timelineStore';

describe('timelineStore behavior', () => {
    beforeEach(() => {
        // Reset only the fields we touch to a known baseline
        useTimelineStore.setState({
            timeline: { ...useTimelineStore.getState().timeline, currentTimeSec: 12 },
            transport: {
                ...useTimelineStore.getState().transport,
                loopEnabled: false,
                loopStartSec: 2,
                loopEndSec: 5,
            },
            timelineView: { startSec: 0, endSec: 60 },
            rowHeight: 30,
        });
    });

    it('setTimelineView does not change currentTimeSec (panH should not scrub)', () => {
        const s1 = useTimelineStore.getState();
        expect(s1.timeline.currentTimeSec).toBe(12);
        s1.setTimelineView(5, 15);
        const s2 = useTimelineStore.getState();
        expect(s2.timeline.currentTimeSec).toBe(12);
        expect(s2.timelineView.startSec).toBeCloseTo(5, 6);
        expect(s2.timelineView.endSec).toBeCloseTo(15, 6);
    });

    it('toggling loop does not change the timelineView window', () => {
        const s = useTimelineStore.getState();
        const before = { ...s.timelineView };
        s.toggleLoop();
        const after = useTimelineStore.getState().timelineView;
        expect(after.startSec).toBeCloseTo(before.startSec, 6);
        expect(after.endSec).toBeCloseTo(before.endSec, 6);
    });

    it('setRowHeight clamps between 16 and 160 px', () => {
        const s = useTimelineStore.getState();
        s.setRowHeight(5);
        expect(useTimelineStore.getState().rowHeight).toBe(16);
        s.setRowHeight(2000);
        expect(useTimelineStore.getState().rowHeight).toBe(160);
        s.setRowHeight(42);
        expect(useTimelineStore.getState().rowHeight).toBe(42);
    });
});
