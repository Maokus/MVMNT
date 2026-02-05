import { describe, expect, it } from 'vitest';

import { createTempoMapper, type TempoMapperProfileEvent, type TempoMapperProfiler } from '@core/timing';

describe('TempoMapper service', () => {
    it('maps seconds to ticks for constant tempo', () => {
        const mapper = createTempoMapper({ ticksPerQuarter: 960, globalBpm: 120, tempoMap: undefined });
        expect(mapper.secondsToTicks(0)).toBe(0);
        expect(mapper.secondsToTicks(0.5)).toBeCloseTo(960);
        expect(mapper.secondsToTicks(1)).toBeCloseTo(1920);
        expect(mapper.ticksToSeconds(1920)).toBeCloseTo(1);
    });

    it('handles stepped tempo maps', () => {
        const mapper = createTempoMapper({
            ticksPerQuarter: 960,
            globalBpm: 120,
            tempoMap: [
                { time: 0, bpm: 120 },
                { time: 2, bpm: 60 },
            ],
        });
        expect(mapper.secondsToTicks(1)).toBeCloseTo(1920);
        expect(mapper.secondsToTicks(2)).toBeCloseTo(3840);
        // After the tempo change to 60 BPM (960 ticks per second)
        expect(mapper.secondsToTicks(3)).toBeCloseTo(4800);
        expect(mapper.ticksToSeconds(4800)).toBeCloseTo(3);
    });

    it('supports linear ramp tempo segments', () => {
        const mapper = createTempoMapper({
            ticksPerQuarter: 960,
            globalBpm: 120,
            tempoMap: [
                { time: 0, bpm: 120, curve: 'linear' },
                { time: 2, bpm: 180 },
            ],
        });
        const ticksAtOneSecond = mapper.secondsToTicks(1);
        // Start ticks per second = 1920, end = 2880. Linear ramp integral -> 1920 + 0.5 * 480.
        expect(ticksAtOneSecond).toBeCloseTo(2160, 5);
        const seconds = mapper.ticksToSeconds(ticksAtOneSecond);
        expect(seconds).toBeCloseTo(1, 5);
    });

    it('performs batch conversions efficiently', () => {
        const mapper = createTempoMapper({ ticksPerQuarter: 960, globalBpm: 90, tempoMap: undefined });
        const secondsBatch = mapper.ticksToSecondsBatch([0, 960, 1920, 2880]);
        expect(Array.from(secondsBatch)).toEqual([0, 0.6666666666666666, 1.3333333333333333, 2]);
        const ticksBatch = mapper.secondsToTicksBatch([0, 0.5, 1]);
        expect(Array.from(ticksBatch)).toEqual([0, 720, 1440]);
    });

    it('records profiling events when profiler provided', () => {
        const events: Array<{ event: TempoMapperProfileEvent; duration: number }> = [];
        const profiler: TempoMapperProfiler = {
            record(event, durationNanoseconds) {
                events.push({ event, duration: durationNanoseconds });
            },
        };
        const mapper = createTempoMapper({ ticksPerQuarter: 960, globalBpm: 120, tempoMap: undefined }, profiler);
        mapper.secondsToTicks(1);
        mapper.ticksToSeconds(960);
        mapper.secondsToTicksBatch([0, 0.25]);
        mapper.ticksToSecondsBatch([0, 480]);
        expect(events.map((entry) => entry.event)).toEqual([
            'seconds-to-ticks',
            'ticks-to-seconds',
            'seconds-batch',
            'ticks-batch',
        ]);
        expect(events.every((entry) => entry.duration >= 0)).toBe(true);
    });
});
