import { describe, it, expect } from 'vitest';
import { TimingManager, TempoMapEntry } from '@core/timing';

describe('TimingManager additions', () => {
    it('beatsToSecondsWithMap and secondsToBeatsWithMap handle tempo changes', () => {
        const tm = new TimingManager('test');
        const map: TempoMapEntry[] = [
            { time: 0, bpm: 120 }, // 0.5s per beat
            { time: 10, bpm: 60 }, // 1.0s per beat, cumulative beats at 10s = 20
        ];

        // beats -> seconds
        expect(tm.beatsToSecondsWithMap(0, map)).toBeCloseTo(0, 6);
        expect(tm.beatsToSecondsWithMap(10, map)).toBeCloseTo(5, 6);
        expect(tm.beatsToSecondsWithMap(20, map)).toBeCloseTo(10, 6);
        expect(tm.beatsToSecondsWithMap(25, map)).toBeCloseTo(15, 6);

        // seconds -> beats
        expect(tm.secondsToBeatsWithMap(0, map)).toBeCloseTo(0, 6);
        expect(tm.secondsToBeatsWithMap(5, map)).toBeCloseTo(10, 6);
        expect(tm.secondsToBeatsWithMap(10, map)).toBeCloseTo(20, 6);
        expect(tm.secondsToBeatsWithMap(15, map)).toBeCloseTo(25, 6);
    });

    it('getBarAlignedWindow returns correct window for fixed tempo', () => {
        const tm = new TimingManager('test');
        tm.setBPM(120); // 0.5s per beat, 4 beats per bar => 2s per bar

        const win2 = tm.getBarAlignedWindow(3.1, 2); // center at ~6.2 beats -> barIndex 1
        expect(win2.start).toBeCloseTo(0, 6); // bars [0,2) => [0s, 4s)
        expect(win2.end).toBeCloseTo(4, 6);

        const win1 = tm.getBarAlignedWindow(5.0, 1); // 10 beats -> barIndex 2 -> [4s,6s)
        expect(win1.start).toBeCloseTo(4, 6);
        expect(win1.end).toBeCloseTo(6, 6);
    });

    it('supports half-bar time windows', () => {
        const tm = new TimingManager('test');
        tm.setBPM(120);

        expect(tm.getTimeUnitWindow(0.5, 0.5)).toEqual({ start: 0, end: 1 });
        expect(tm.getTimeUnitWindow(1.5, 0.5)).toEqual({ start: 1, end: 2 });
        expect(tm.getTimeUnitWindow(2.5, 0.5)).toEqual({ start: 2, end: 3 });
    });

    it('uses host conversions for tempo-mapped bar windows and grids', () => {
        const host = new TimingManager('host');
        host.setTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);
        const element = new TimingManager('element');
        element.setConversions({
            secondsToBeats: (seconds) => host.secondsToBeats(seconds),
            beatsToSeconds: (beats) => host.beatsToSeconds(beats),
        });

        expect(element.getTimeUnitWindow(3, 1)).toEqual({ start: 2, end: 6 });
        expect(element.getBeatGridInWindow(2, 6).map((beat) => beat.time)).toEqual([2, 3, 4, 5, 6]);
        expect(element.ticksToSeconds(8 * element.ticksPerQuarter)).toBe(6);
    });
});
