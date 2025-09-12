import { describe, it, expect } from 'vitest';
import { SimulatedClock } from './simulated-clock';

describe('SimulatedClock', () => {
    it('produces deterministic times with prePadding and playRangeStart', () => {
        const fps = 30;
        const prePaddingSec = 0.5; // 500ms preroll
        const playRangeStartSec = 12.0; // start at 12s
        const startFrame = 10; // export starting from frame 10
        const clock = new SimulatedClock({ fps, prePaddingSec, playRangeStartSec, startFrame });

        // Frame 0: (playStart - prePadding) + (startFrame + 0)/fps
        const expected0 = playRangeStartSec - prePaddingSec + startFrame / fps;
        expect(clock.timeForFrame(0)).toBeCloseTo(expected0, 10);

        // Frame 1 adds another 1/fps
        const expected1 = expected0 + 1 / fps;
        expect(clock.timeForFrame(1)).toBeCloseTo(expected1, 10);

        // A few random checks
        const idx = 57;
        const expectedIdx = playRangeStartSec - prePaddingSec + (startFrame + idx) / fps;
        expect(clock.timeForFrame(idx)).toBeCloseTo(expectedIdx, 10);
    });
});
