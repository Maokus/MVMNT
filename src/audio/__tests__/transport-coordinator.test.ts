import { describe, it, expect } from 'vitest';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';

function advance(tc: TransportCoordinator, steps: number[], startMs = 0) {
    let now = startMs;
    const ticks: number[] = [];
    for (const dt of steps) {
        now += dt;
        const t = tc.updateFrame(now);
        if (typeof t === 'number') ticks.push(t);
    }
    return ticks;
}

describe('TransportCoordinator Phase 0 (clock fallback)', () => {
    it('advances ticks over time while playing (clock source)', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.play();
        const tc = new TransportCoordinator();
        tc.play(0);
        const tm = getSharedTimingManager();
        tm.setBPM(120); // 2 beats / sec, ticksPerSecond = 1920
        const res = advance(tc, [1000, 500]);
        // We require at least one tick emission and that ticks advance over successive frames.
        expect(res.length).toBeGreaterThanOrEqual(1);
        if (res.length > 1) {
            expect(res[1]).toBeGreaterThan(res[0]);
        }
        // Final emitted tick should be > 900 ensuring ~1 beat progressed at 120 BPM.
        expect(res[res.length - 1]).toBeGreaterThan(900);
    });

    it('seek while paused updates internal lastDerivedTick', () => {
        const api = useTimelineStore.getState();
        api.pause();
        const tc = new TransportCoordinator();
        tc.seek(5000);
        expect(tc.getState().lastDerivedTick).toBe(5000);
        tc.updateFrame(100);
        expect(tc.getState().lastDerivedTick).toBe(5000);
    });
});
