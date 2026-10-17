import { describe, expect, it } from 'vitest';
import { clamp, clamp01 } from '@math/transforms/numeric';

describe('shared clamp', () => {
    it('clamps below min to min', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps above max to max', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('passes through in-range values', () => {
        expect(clamp(4, 0, 10)).toBe(4);
    });

    it('matches clamp01 at the 0..1 bounds', () => {
        expect(clamp(-0.5, 0, 1)).toBe(clamp01(-0.5));
        expect(clamp(0.5, 0, 1)).toBe(clamp01(0.5));
        expect(clamp(1.5, 0, 1)).toBe(clamp01(1.5));
    });
});
