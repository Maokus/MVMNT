import { describe, it, expect } from 'vitest';
import { createTimingContext, secondsToTicks, ticksToSeconds } from '../timelineTime';
import type { TempoMapEntry } from '@state/timelineTypes';

describe('timelineTime conversions', () => {
    it('converts seconds to ticks using global bpm', () => {
        const ctx = createTimingContext({ globalBpm: 120, beatsPerBar: 4, masterTempoMap: undefined }, 960);
        const ticks = secondsToTicks(ctx, 1); // 120 bpm => 2 beats per second => 1920 ticks
        expect(Math.round(ticks)).toBe(1920);
        const seconds = ticksToSeconds(ctx, ticks);
        expect(seconds).toBeCloseTo(1, 5);
    });

    it('honors tempo map entries when converting', () => {
        const tempoMap: TempoMapEntry[] = [
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ];
        const ctx = createTimingContext({ globalBpm: 120, beatsPerBar: 4, masterTempoMap: tempoMap }, 960);
        const ticks = secondsToTicks(ctx, 3); // first 2s at 120bpm, last 1s at 60bpm
        // 2 seconds at 120 bpm = 4 beats; 1 second at 60 bpm = 1 beat => 5 beats total => 4800 ticks
        expect(Math.round(ticks)).toBe(4800);
        expect(ticksToSeconds(ctx, ticks)).toBeCloseTo(3, 5);
    });
});
