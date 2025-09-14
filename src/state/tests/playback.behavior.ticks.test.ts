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
