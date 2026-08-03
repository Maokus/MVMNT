import { describe, expect, it } from 'vitest';
import { aggregateTransformDelta } from '../aggregateTransformDelta';

describe('aggregateTransformDelta', () => {
    it('turns cumulative rotation drag values into incremental deltas', () => {
        expect(aggregateTransformDelta(5, 0, undefined, 'add')).toBe(5);
        expect(aggregateTransformDelta(8, 0, 5, 'add')).toBe(3);
        expect(aggregateTransformDelta(8, 0, 8, 'add')).toBe(0);
    });

    it('turns cumulative scale percentages into incremental factors', () => {
        expect(aggregateTransformDelta(110, 100, undefined, 'multiply')).toBeCloseTo(1.1);
        expect(aggregateTransformDelta(120, 100, 110, 'multiply')).toBeCloseTo(120 / 110);
        expect(aggregateTransformDelta(120, 100, 120, 'multiply')).toBe(1);
    });
});
