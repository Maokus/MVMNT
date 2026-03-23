import { describe, it, expect } from 'vitest';
import { AutomationCurve } from '../automation-curve';
import type { AutomationChannel, AutomationKeyframe } from '../types';

function makeChannel(
    keyframes: AutomationKeyframe[],
    opts: Partial<AutomationChannel> = {},
): AutomationChannel {
    return {
        id: 'test.prop',
        elementId: 'test',
        propertyKey: 'prop',
        keyframes,
        interpolation: opts.interpolation ?? 'linear',
        valueType: opts.valueType ?? 'number',
    };
}

function kf(tick: number, value: unknown, easingId: string = 'linear'): AutomationKeyframe {
    return { tick, value, easingId };
}

describe('AutomationCurve', () => {
    describe('empty channel', () => {
        it('returns undefined for empty keyframes', () => {
            const curve = new AutomationCurve(makeChannel([]));
            expect(curve.evaluate(0)).toBeUndefined();
            expect(curve.evaluate(100)).toBeUndefined();
        });
    });

    describe('single keyframe', () => {
        it('returns the single value at any tick', () => {
            const curve = new AutomationCurve(makeChannel([kf(100, 42)]));
            expect(curve.evaluate(0)).toBe(42);
            expect(curve.evaluate(100)).toBe(42);
            expect(curve.evaluate(999)).toBe(42);
        });
    });

    describe('linear numeric interpolation', () => {
        it('interpolates between two keyframes', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 0), kf(100, 100)], { interpolation: 'linear' }),
            );
            expect(curve.evaluate(0)).toBe(0);
            expect(curve.evaluate(50)).toBe(50);
            expect(curve.evaluate(100)).toBe(100);
        });

        it('holds first value before first keyframe', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(100, 10), kf(200, 20)]),
            );
            expect(curve.evaluate(0)).toBe(10);
            expect(curve.evaluate(50)).toBe(10);
        });

        it('holds last value after last keyframe', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 0), kf(100, 50)]),
            );
            expect(curve.evaluate(200)).toBe(50);
            expect(curve.evaluate(1000)).toBe(50);
        });

        it('interpolates across multiple segments', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 0), kf(100, 100), kf(200, 0)]),
            );
            expect(curve.evaluate(50)).toBe(50);
            expect(curve.evaluate(100)).toBe(100);
            expect(curve.evaluate(150)).toBe(50);
            expect(curve.evaluate(200)).toBe(0);
        });
    });

    describe('stepped interpolation', () => {
        it('holds previous keyframe value until next tick', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 10), kf(100, 20), kf(200, 30)], { interpolation: 'stepped' }),
            );
            expect(curve.evaluate(0)).toBe(10);
            expect(curve.evaluate(50)).toBe(10);
            expect(curve.evaluate(99)).toBe(10);
            expect(curve.evaluate(100)).toBe(20);
            expect(curve.evaluate(150)).toBe(20);
            expect(curve.evaluate(200)).toBe(30);
        });
    });

    describe('eased interpolation', () => {
        it('applies per-keyframe easing (easeInQuad makes progress slower at start)', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 0, 'easeInQuad'), kf(100, 100)], { interpolation: 'eased' }),
            );
            // easeInQuad(0.5) = 0.25, so at tick 50 the value should be 25
            expect(curve.evaluate(50)).toBeCloseTo(25, 1);
            expect(curve.evaluate(0)).toBe(0);
            expect(curve.evaluate(100)).toBe(100);
        });

        it('falls back to linear for unknown easing ID', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, 0, 'nonexistentEasing'), kf(100, 100)], { interpolation: 'eased' }),
            );
            expect(curve.evaluate(50)).toBeCloseTo(50, 1);
        });
    });

    describe('boolean values (always stepped)', () => {
        it('holds boolean value regardless of interpolation mode', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, false), kf(100, true)], {
                    interpolation: 'linear',
                    valueType: 'boolean',
                }),
            );
            expect(curve.evaluate(0)).toBe(false);
            expect(curve.evaluate(50)).toBe(false);
            expect(curve.evaluate(99)).toBe(false);
            expect(curve.evaluate(100)).toBe(true);
        });
    });

    describe('color interpolation', () => {
        it('interpolates hex colors between keyframes', () => {
            const curve = new AutomationCurve(
                makeChannel([kf(0, '#000000'), kf(100, '#ffffff')], {
                    interpolation: 'linear',
                    valueType: 'color',
                }),
            );
            expect(curve.evaluate(0)).toBe('#000000');
            // At midpoint each channel should be 128 (0x80)
            const mid = curve.evaluate(50) as string;
            expect(mid).toMatch(/^#[0-9a-f]{6}$/);
            // Each component should be approximately 128
            const r = parseInt(mid.slice(1, 3), 16);
            const g = parseInt(mid.slice(3, 5), 16);
            const b = parseInt(mid.slice(5, 7), 16);
            expect(r).toBeGreaterThanOrEqual(127);
            expect(r).toBeLessThanOrEqual(128);
            expect(g).toBeGreaterThanOrEqual(127);
            expect(b).toBeGreaterThanOrEqual(127);
        });
    });

    describe('hasKeyframeAt', () => {
        it('finds keyframes within tolerance', () => {
            const curve = new AutomationCurve(makeChannel([kf(0, 0), kf(100, 1)]));
            expect(curve.hasKeyframeAt(0)).toBe(true);
            expect(curve.hasKeyframeAt(100)).toBe(true);
            expect(curve.hasKeyframeAt(50)).toBe(false);
            expect(curve.hasKeyframeAt(100.3, 0.5)).toBe(true);
            expect(curve.hasKeyframeAt(101, 0.5)).toBe(false);
        });
    });

    describe('length', () => {
        it('returns keyframe count', () => {
            expect(new AutomationCurve(makeChannel([])).length).toBe(0);
            expect(new AutomationCurve(makeChannel([kf(0, 0)])).length).toBe(1);
            expect(new AutomationCurve(makeChannel([kf(0, 0), kf(100, 1)])).length).toBe(2);
        });
    });
});
