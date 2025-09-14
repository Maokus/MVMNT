import { describe, it, expect } from 'vitest';
import { formatTickAsBBT, parseBBT, getBeatGridInTicks, DEFAULT_TICKS_PER_QUARTER } from '../bbt';

describe('BBT utilities', () => {
    it('formatTickAsBBT basic', () => {
        expect(formatTickAsBBT(0)).toBe('1.1.0');
        expect(formatTickAsBBT(DEFAULT_TICKS_PER_QUARTER)).toBe('1.2.0');
        expect(formatTickAsBBT(DEFAULT_TICKS_PER_QUARTER * 4)).toBe('2.1.0');
    });
    it('parseBBT variants', () => {
        const t1 = parseBBT('1.1.0');
        const t2 = parseBBT('2.1.0');
        const t3 = parseBBT('3:2:120');
        expect(t1).toBe(0);
        expect(t2).toBe(DEFAULT_TICKS_PER_QUARTER * 4);
        expect(typeof t3).toBe('number');
    });
    it('grid generation', () => {
        const start = 0;
        const end = DEFAULT_TICKS_PER_QUARTER * 8; // two bars at 4/4
        const grid = getBeatGridInTicks(start, end);
        const bars = grid.filter((g) => g.type === 'bar');
        expect(bars.length).toBeGreaterThanOrEqual(3); // bar 0,1,2 maybe extra bound
        // Ensure first tick is 0
        expect(grid[0].tick).toBe(0);
    });
});
