import { describe, expect, it } from 'vitest';
import {
    clipTemporalIntervalAcrossWindows,
    mapTimeToTemporalPosition,
    resolveTemporalWindow,
    TimingManager,
} from '@core/timing';

describe('temporal windows', () => {
    it('models the Moving Notes viewport as a continuously anchored beat window', () => {
        const timing = new TimingManager('moving-notes');
        timing.setTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);

        const frame = resolveTemporalWindow(timing, 3, {
            cadence: 'continuous',
            bars: 1,
            anchorPosition: 0.5,
        });

        expect(frame.viewport).toEqual({ start: 1.5, end: 5 });
        expect(frame.reconstruction).toBe('interpolate');
        expect(frame.materialization).toBe(frame.viewport);
        expect(mapTimeToTemporalPosition(3, frame)).toBe(0.5);
        // Preserve the existing seconds-domain reconstruction around a fixed playhead,
        // including its asymmetric edge geometry across a tempo change.
        expect(mapTimeToTemporalPosition(frame.viewport.start, frame)).toBeCloseTo(1 / 14);
        expect(mapTimeToTemporalPosition(frame.viewport.end, frame)).toBe(1);
        expect(mapTimeToTemporalPosition(frame.viewport.end, frame, frame.viewport, false)).toBeCloseTo(15 / 14);
    });

    it('models Time Unit as held previous/current/next bar windows at an exact boundary', () => {
        const timing = new TimingManager('time-unit');
        timing.setBPM(120);

        const frame = resolveTemporalWindow(timing, 2, {
            cadence: 'transport-relative',
            bars: 1,
            lookAheadSeconds: 0.3,
        });

        expect(frame.windows).toEqual({
            previous: { start: -2, end: 0 },
            current: { start: 0, end: 2 },
            next: { start: 2, end: 4 },
        });
        expect(frame.viewport).toBe(frame.windows.current);
        expect(frame.reconstruction).toBe('hold');
        expect(frame.materialization).toEqual({ start: -2, end: 2.3 });
        expect(mapTimeToTemporalPosition(1, frame)).toBe(0.5);
    });

    it('clips interval events at shared half-open window boundaries', () => {
        const windows = [
            { start: 0, end: 2 },
            { start: 2, end: 4 },
            { start: 4, end: 6 },
        ];

        expect(clipTemporalIntervalAcrossWindows({ start: 1.5, end: 4.5 }, windows)).toEqual([
            { interval: { start: 1.5, end: 2 }, window: windows[0] },
            { interval: { start: 2, end: 4 }, window: windows[1] },
            { interval: { start: 4, end: 4.5 }, window: windows[2] },
        ]);
        expect(clipTemporalIntervalAcrossWindows({ start: 2, end: 4 }, windows)).toEqual([
            { interval: { start: 2, end: 4 }, window: windows[1] },
        ]);
    });
});
