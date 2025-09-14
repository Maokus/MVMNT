import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../timelineStore';
import { getSharedTimingManager } from '../timelineStore';

describe('timelineStore behavior', () => {
    beforeEach(() => {
        // Canonical tick domain seeding: choose a tick corresponding to 12s at 120bpm (0.5s per beat) => 24 beats.
        const tm = getSharedTimingManager();
        tm.setBPM(120); // ensure expected mapping
        const beats = 24; // 12 seconds * (120 bpm / 60) = 24 beats
        const currentTick = Math.round(beats * tm.ticksPerQuarter);
        // Loop seconds (2-5s) become ticks as well; ensure store derives seconds via subscribe shim
        const loopStartBeats = 2 * (120 / 60); // 2s => 4 beats
        const loopEndBeats = 5 * (120 / 60); // 5s => 10 beats
        const loopStartTick = Math.round(loopStartBeats * tm.ticksPerQuarter);
        const loopEndTick = Math.round(loopEndBeats * tm.ticksPerQuarter);
        useTimelineStore.setState({
            timeline: { ...useTimelineStore.getState().timeline, currentTick },
            transport: {
                ...useTimelineStore.getState().transport,
                loopEnabled: false,
                loopStartTick,
                loopEndTick,
            },
            // Seed view in ticks for ~60s span: 60s => 120 beats => ticks
            timelineView: {
                startTick: 0,
                endTick: Math.round(120 * tm.ticksPerQuarter),
            },
            rowHeight: 30,
        });
    });

    it('setTimelineViewTicks does not change currentTick (panning should not scrub)', () => {
        const s1 = useTimelineStore.getState();
        const originalTick = s1.timeline.currentTick;
        s1.setTimelineViewTicks(100, 1000);
        const s2 = useTimelineStore.getState();
        expect(s2.timeline.currentTick).toBe(originalTick);
        expect(s2.timelineView.startTick).toBe(100);
        expect(s2.timelineView.endTick).toBe(1000);
        // Derived seconds remain stable
        const secBefore = s1.timeline.currentTimeSec;
        const secAfter = s2.timeline.currentTimeSec;
        expect(secAfter).toBeCloseTo(secBefore!, 6);
    });

    it('toggling loop does not change the timelineView window (ticks)', () => {
        const s = useTimelineStore.getState();
        const before = { ...s.timelineView };
        s.toggleLoop();
        const after = useTimelineStore.getState().timelineView;
        expect(after.startTick).toBe(before.startTick);
        expect(after.endTick).toBe(before.endTick);
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
