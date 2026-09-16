import { describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '../ppq';
import { quarterNotesPerBar, ticksPerBar, ticksPerMeterBeat } from '../meter';
import { formatTickAsBBT, parseBBT } from '../time-domain';

describe('time signature helpers', () => {
    it('uses the denominator when mapping 6/8 bars and beats', () => {
        const meter = { numerator: 6, denominator: 8 };
        expect(ticksPerMeterBeat(meter)).toBe(CANONICAL_PPQ / 2);
        expect(ticksPerBar(meter)).toBe(CANONICAL_PPQ * 3);
        expect(quarterNotesPerBar(meter)).toBe(3);
        expect(formatTickAsBBT(CANONICAL_PPQ * 3, CANONICAL_PPQ, meter)).toBe('2.1.0');
        expect(parseBBT('2.1.0', CANONICAL_PPQ, meter)?.ticks).toBe(CANONICAL_PPQ * 3);
    });
});
