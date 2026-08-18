import { describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { quantizeDivisionToTick, quantizeSettingToExactTicks } from './quantize';

describe('arbitrary quantize divisions', () => {
    it('returns to an exact bar boundary after every custom division cycle', () => {
        const beatsPerBar = 4;
        const divisionsPerBar = 7;
        const ticksPerBar = beatsPerBar * CANONICAL_PPQ;

        expect(quantizeSettingToExactTicks('arbitrary', beatsPerBar, CANONICAL_PPQ, divisionsPerBar)).toBe(
            ticksPerBar / divisionsPerBar
        );
        expect(quantizeDivisionToTick(divisionsPerBar, 'arbitrary', beatsPerBar, CANONICAL_PPQ, divisionsPerBar)).toBe(
            ticksPerBar
        );
        expect(
            quantizeDivisionToTick(divisionsPerBar * 100, 'arbitrary', beatsPerBar, CANONICAL_PPQ, divisionsPerBar)
        ).toBe(ticksPerBar * 100);
    });
});
