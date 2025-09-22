import { describe, it, expect } from 'vitest';
import { ExportClock } from './export-clock';

describe('SimulatedClock', () => {
    it('produces deterministic times with playRangeStart (no padding)', () => {
        const fps = 30;
        const playRangeStartSec = 12.0; // start at 12s
        const startFrame = 10; // export starting from frame 10
        const clock = new ExportClock({ fps, playRangeStartSec, startFrame });

        const expected0 = playRangeStartSec + startFrame / fps;
        expect(clock.timeForFrame(0)).toBeCloseTo(expected0, 10);

        const expected1 = expected0 + 1 / fps;
        expect(clock.timeForFrame(1)).toBeCloseTo(expected1, 10);

        const idx = 57;
        const expectedIdx = playRangeStartSec + (startFrame + idx) / fps;
        expect(clock.timeForFrame(idx)).toBeCloseTo(expectedIdx, 10);
    });
});
