import { describe, it, expect } from 'vitest';
import { clamp, lerp, invLerp, remap, FloatCurve, type EasingFn } from './anim-math';
import easings from '@animation/easing';

// Helper almost-equal
const closeTo = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('AnimMath primitives', () => {
    it('clamp works for below / within / above', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('lerp interpolates linearly', () => {
        expect(lerp(0, 10, 0)).toBe(0);
        expect(lerp(0, 10, 0.5)).toBe(5);
        expect(lerp(0, 10, 1)).toBe(10);
    });

    it('invLerp handles normal and zero-span cases', () => {
        expect(invLerp(0, 10, 5)).toBe(0.5);
        // Zero span -> defined as 0
        expect(invLerp(2, 2, 2)).toBe(0);
    });

    it('remap remaps values and clamps outside range', () => {
        expect(remap(0, 100, 0, 1, 25)).toBe(0.25);
        // Below input -> clamps to 0
        expect(remap(0, 100, 0, 1, -10)).toBe(0);
        // Above input -> clamps to 1
        expect(remap(0, 100, 0, 1, 150)).toBe(1);
        // Reverse output range
        expect(remap(0, 10, 10, 0, 2.5)).toBe(7.5);
    });
});

describe('FloatCurve construction & boundaries', () => {
    it('defaults to linear 0->1 when no points supplied', () => {
        const c = new FloatCurve([]);
        expect(c.valAt(0)).toBe(0);
        expect(closeTo(c.valAt(0.5), 0.5)).toBe(true);
        expect(c.valAt(1)).toBe(1);
    });

    it('injects missing boundary points', () => {
        const c = new FloatCurve([
            [0.25, 5],
            [0.75, 10],
        ]);
        // Start should interpolate from implicit 0@0 to 5@0.25
        expect(c.valAt(0)).toBe(0);
        expect(closeTo(c.valAt(0.25), 5)).toBe(true);
        // End should reach last value at factor 1 (carried forward from last explicit point)
        expect(closeTo(c.valAt(1), 10)).toBe(true);
    });

    it('clamps factors outside [0,1]', () => {
        const c = new FloatCurve([
            [0, 0],
            [1, 2],
        ]);
        expect(c.valAt(-5)).toBe(0);
        expect(c.valAt(5)).toBe(2);
    });

    it('sorts & deduplicates points (last wins)', () => {
        const c = new FloatCurve([
            [0.6, 20],
            [0.2, 5],
            [0.2, 10], // duplicate factor: should overwrite previous 5
            [1, 50],
        ]);
        expect(closeTo(c.valAt(0.2), 10)).toBe(true);
        expect(closeTo(c.valAt(0.6), 20)).toBe(true);
        expect(closeTo(c.valAt(1), 50)).toBe(true);
    });

    it('clamps out-of-range factors in constructor', () => {
        const c = new FloatCurve([
            [-0.5, 100], // should clamp to 0 factor
            [1.5, 200], // clamp to 1 factor
        ]);
        // Start point gets injected as 0 with value from clamped first (100) but then replaced by boundary injection logic value 0? Actually: mapped first factor becomes 0, then since first factor==0 no new implicit. Last factor becomes 1 so ok.
        expect(c.valAt(0)).toBe(100);
        expect(c.valAt(1)).toBe(200);
    });
});

describe('FloatCurve interpolation & easing', () => {
    it('linear interpolation between two points', () => {
        const c = new FloatCurve([
            [0, 10],
            [1, 20],
        ]);
        expect(closeTo(c.valAt(0.5), 15)).toBe(true);
    });

    it('applies easing function of starting point', () => {
        const square: EasingFn = (t) => t * t; // easeInQuad style
        const c = new FloatCurve([
            [0, 0, square],
            [1, 1],
        ]);
        const mid = c.valAt(0.5); // easedT = 0.25
        expect(closeTo(mid, 0.25)).toBe(true);
    });

    it('uses provided easing per segment (multi-point)', () => {
        const c = new FloatCurve([
            [0, 0, easings.easeInQuad],
            [0.5, 1, easings.linear],
            [1, 0],
        ]);
        // First half uses easeInQuad: at 0.25 localT=0.5 -> squared=0.25 from 0->1
        expect(closeTo(c.valAt(0.25), 0.25)).toBe(true);
        // Midpoint exactly second point value
        expect(closeTo(c.valAt(0.5), 1)).toBe(true);
        // Second segment linear from 1->0: at 0.75 localT=0.5 -> 0.5
        expect(closeTo(c.valAt(0.75), 0.5)).toBe(true);
    });

    it('returns last value for factors > last (safety path)', () => {
        const c = new FloatCurve([
            [0, 5],
            [0.4, 10],
            [1, 20],
        ]);
        expect(c.valAt(2)).toBe(20);
    });
});

describe('FloatCurve defensive getPoints', () => {
    it('returns a copy, not internal references', () => {
        const c = new FloatCurve([
            [0, 0],
            [1, 10],
        ]);
        const pts = c.getPoints();
        expect(Array.isArray(pts)).toBe(true);
        // Mutate returned structure
        pts[0].value = 999;
        // Original curve should remain unaffected
        expect(c.valAt(0)).toBe(0);
    });
});
