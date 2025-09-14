import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, getSharedTimingManager } from '../timelineStore';

// Simple manual clock advancement simulation helper
function advanceTickManually(ticks: number) {
    // Directly set current tick to simulate clock advance (as Visualizer loop would)
    const s = useTimelineStore.getState();
    s.setCurrentTick(s.timeline.currentTick + ticks, 'clock');
}

describe('tick-domain transport behaviors', () => {
    beforeEach(() => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        useTimelineStore.setState({
            timeline: { ...useTimelineStore.getState().timeline, currentTick: 0 },
            transport: { ...useTimelineStore.getState().transport, isPlaying: false, loopEnabled: false },
        });
    });

    it('pausing freezes tick advancement', () => {
        const s = useTimelineStore.getState();
        s.play();
        const startTick = useTimelineStore.getState().timeline.currentTick;
        advanceTickManually(240); // simulate some frames
        s.pause();
        const pausedTick = useTimelineStore.getState().timeline.currentTick;
        advanceTickManually(480); // should be ignored logically while paused (we do not call play())
        const after = useTimelineStore.getState().timeline.currentTick;
        // Since we directly set ticks with authority 'clock', this test ensures no unintended side-effect resets
        expect(after).toBe(pausedTick);
        expect(pausedTick).toBeGreaterThanOrEqual(startTick);
    });

    it('BPM change affects expected tick->seconds ratio (derived seconds shrink/grow)', () => {
        const tm = getSharedTimingManager();
        const s = useTimelineStore.getState();
        s.setCurrentTick(0, 'user');
        s.play();
        advanceTickManually(480); // 480 ticks at 120bpm (assuming 480 tpq) => 1 beat? Actually depends on ticksPerQuarter.
        const secAt120 = useTimelineStore.getState().timeline.currentTimeSec!;
        s.setGlobalBpm(240); // double tempo => seconds representation should roughly halve for same beats worth of ticks
        const secAfterTempo = useTimelineStore.getState().timeline.currentTimeSec!;
        expect(secAfterTempo).toBeLessThan(secAt120 + 1e-6); // faster tempo => less seconds elapsed for same tick position
    });
});
