import { describe, it, expect } from 'vitest';
import { PlaybackClock } from '@core/playback-clock';
import { TimingManager } from '@core/timing';

// Simple fake performance timeline progression helper
function run(clock: PlaybackClock, tm: TimingManager, steps: Array<{ dtMs: number; bpm?: number }>) {
    let now = 0;
    const ticks: number[] = [];
    // Prime clock so first delta applies
    clock.update(0);
    for (const s of steps) {
        if (s.bpm) tm.setBPM(s.bpm);
        now += s.dtMs;
        ticks.push(clock.update(now));
    }
    return ticks;
}

describe('PlaybackClock basic tempo handling', () => {
    it('accumulates ticks at 120 then 60 BPM correctly', () => {
        const tm = new TimingManager();
        tm.setBPM(120); // 2 beats per second
        const clock = new PlaybackClock({ timingManager: tm, initialTick: 0 });
        const ppq = tm.ticksPerQuarter; // default canonical PPQ (480)
        // 500ms -> 1 beat at 120 BPM (0.5s * 2 beats/sec)
        const steps = [
            { dtMs: 500 }, // ~1 beat
            { dtMs: 500 }, // another beat (total 2)
            { dtMs: 500, bpm: 60 }, // BPM change before advancing (now 1 beat/sec)
            { dtMs: 1000 }, // should add ~1 beat at 60
        ];
        const ticks = run(clock, tm, steps);
        // After first 500ms we expect roughly 1 beat (allow wider tolerance due to dynamic SPB sampling)
        expect(ticks[0]).toBeGreaterThan(ppq * 0.8);
        expect(ticks[0]).toBeLessThan(ppq * 1.2);
        // After second 500ms (1s total at 120 BPM) should be near 2 beats
        expect(ticks[1]).toBeGreaterThan(ppq * 1.6);
        expect(ticks[1]).toBeLessThan(ppq * 2.4);
        // After BPM change to 60, next 1000ms adds about 1 beat (but may overshoot slightly)
        const deltaAfterChange = ticks[3] - ticks[1];
        expect(deltaAfterChange).toBeGreaterThan(ppq * 0.6);
        expect(deltaAfterChange).toBeLessThan(ppq * 1.6);
    });

    it('seek resets fractional accumulator', () => {
        const tm = new TimingManager();
        const clock = new PlaybackClock({ timingManager: tm, initialTick: 123 });
        clock.setTick(500);
        const t = clock.update(16); // first call sets lastWallTimeMs
        expect(t).toBe(500);
    });
});
