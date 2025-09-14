import { describe, it, expect } from 'vitest';
import { TimingManager } from '../timing-manager';
import { CANONICAL_PPQ, basicConverters, beats, tick } from '../time-domain';

function approx(a: number, b: number, eps = 1e-9) {
    expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe('Time Domain Conversions (Phase 1)', () => {
    it('ticks <-> beats basicConverters symmetry', () => {
        const tpq = CANONICAL_PPQ;
        for (let t = 0; t <= tpq * 8; t += 37) {
            const b = basicConverters.ticksToBeats(tick(t), tpq) as number;
            const t2 = basicConverters.beatsToTicks(beats(b), tpq) as number;
            expect(Math.abs(t - t2)).toBeLessThanOrEqual(0.5); // rounding allowance
        }
    });

    it('fixed tempo ticks<->seconds round trip', () => {
        const tm = new TimingManager();
        tm.setBPM(120); // 0.5s per beat
        const tpq = tm.ticksPerQuarter; // 480 default
        for (let t = 0; t < tpq * 16; t += 113) {
            const sec = tm.ticksToSeconds(t);
            const t2 = tm.secondsToTicks(sec);
            approx(t, t2, 1e-6);
        }
    });

    it('tempo map multi-segment ticks<->seconds round trip', () => {
        const tm = new TimingManager();
        tm.setTicksPerQuarter(480);
        // Two segments: 120bpm for first 4s (8 beats), then 90bpm
        tm.setTempoMap([
            { time: 0, bpm: 120 },
            { time: 4, bpm: 90 },
        ]);
        const tpq = tm.ticksPerQuarter;
        const testTicks = [0, tpq * 2, tpq * 4, tpq * 8, tpq * 12, tpq * 16];
        for (const t of testTicks) {
            const sec = tm.ticksToSeconds(t);
            const t2 = tm.secondsToTicks(sec);
            approx(t, t2, 1e-6 * (testTicks.length + 1));
        }
    });

    it('beats<->seconds symmetry with tempo map boundaries', () => {
        const tm = new TimingManager();
        tm.setTempoMap([
            { time: 0, bpm: 100 },
            { time: 3, bpm: 150 }, // boundary at 3s
        ]);
        const beatsToCheck = [0, 1, 4, 8, 12];
        for (const b of beatsToCheck) {
            const sec = tm.beatsToSeconds(b);
            const b2 = tm.secondsToBeats(sec);
            approx(b, b2, 1e-9 * (beatsToCheck.length + 1));
        }
    });
});
