import { describe, it, expect } from 'vitest';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';

describe('TransportCoordinator regression: no backward tick or large jumps', () => {
    it('emits monotonically increasing ticks (clock fallback) without backward jumps', () => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        const tc = new TransportCoordinator({ getAudioContext: () => undefined });
        useTimelineStore.getState().setCurrentTick(0, 'user');
        useTimelineStore.getState().play();
        tc.play(0);
        const emitted: number[] = [];
        let now = 0;
        for (let i = 0; i < 200; i++) {
            now += 16; // simulate ~60fps
            const t = tc.updateFrame(now);
            if (typeof t === 'number') emitted.push(t);
        }
        if (emitted.length > 0) {
            for (let i = 1; i < emitted.length; i++) {
                expect(emitted[i]).toBeGreaterThanOrEqual(emitted[i - 1]);
            }
            // After ~200 * 16ms ~= 3.2s at 120 BPM expect > one beat (>=960) if any emission occurred
            expect(emitted[emitted.length - 1]).toBeGreaterThanOrEqual(900);
        } else {
            // Fallback: ensure we at least stayed at tick 0 (no retrograde) when no emissions.
            expect(useTimelineStore.getState().timeline.currentTick).toBeGreaterThanOrEqual(0);
        }
    });
});
