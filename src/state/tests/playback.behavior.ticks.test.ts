import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, getSharedTimingManager } from '../timelineStore';
import { beatsToSeconds } from '@core/timing/tempo-utils';

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
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.play();
        const oneBeatTicks = tm.ticksPerQuarter; // 1 beat
        advanceTickManually(8 * oneBeatTicks); // 8 beats
        const beatsPos = useTimelineStore.getState().timeline.currentTick / tm.ticksPerQuarter;
        const secAt120 = beatsToSeconds(api.timeline.masterTempoMap, beatsPos, 60 / api.timeline.globalBpm);
        api.setGlobalBpm(240); // faster tempo halves seconds per beat
        const secAt240 = beatsToSeconds(
            api.timeline.masterTempoMap,
            beatsPos,
            60 / useTimelineStore.getState().timeline.globalBpm
        );
        expect(secAt240).toBeLessThan(secAt120 - 1e-9);
    });
});
