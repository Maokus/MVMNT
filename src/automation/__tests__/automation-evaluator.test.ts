import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutomationEvaluatorImpl } from '../automation-evaluator';
import type { AutomationChannel, AutomationKeyframe } from '../types';

function kf(tick: number, value: unknown, easingId = 'linear'): AutomationKeyframe {
    return { tick, value, easingId };
}

function makeChannel(
    id: string,
    keyframes: AutomationKeyframe[],
    opts: Partial<AutomationChannel> = {},
): AutomationChannel {
    const parts = id.split('.');
    return {
        id,
        elementId: parts[0],
        propertyKey: parts.slice(1).join('.'),
        keyframes,
        interpolation: opts.interpolation ?? 'linear',
        valueType: opts.valueType ?? 'number',
    };
}

describe('AutomationEvaluator (integration)', () => {
    let evaluator: AutomationEvaluatorImpl;
    let channels: Record<string, AutomationChannel>;

    beforeEach(() => {
        channels = {};
        evaluator = new AutomationEvaluatorImpl();
        evaluator.setChannelProvider((id) => channels[id]);
    });

    it('evaluates a numeric channel with linear interpolation', () => {
        channels['el.opacity'] = makeChannel('el.opacity', [kf(0, 0), kf(100, 1)]);
        expect(evaluator.evaluate('el.opacity', 0)).toBe(0);
        expect(evaluator.evaluate('el.opacity', 50)).toBeCloseTo(0.5);
        expect(evaluator.evaluate('el.opacity', 100)).toBe(1);
    });

    it('holds first value before first keyframe', () => {
        channels['el.x'] = makeChannel('el.x', [kf(10, 5), kf(20, 15)]);
        expect(evaluator.evaluate('el.x', 0)).toBe(5);
        expect(evaluator.evaluate('el.x', 5)).toBe(5);
    });

    it('holds last value after last keyframe', () => {
        channels['el.x'] = makeChannel('el.x', [kf(10, 5), kf(20, 15)]);
        expect(evaluator.evaluate('el.x', 30)).toBe(15);
        expect(evaluator.evaluate('el.x', 999)).toBe(15);
    });

    it('evaluates boolean channels as stepped', () => {
        channels['el.visible'] = makeChannel('el.visible', [kf(0, true), kf(48, false)], {
            valueType: 'boolean',
        });
        expect(evaluator.evaluate('el.visible', 0)).toBe(true);
        expect(evaluator.evaluate('el.visible', 24)).toBe(true);
        expect(evaluator.evaluate('el.visible', 48)).toBe(false);
    });

    it('evaluates color channels by interpolating RGB components', () => {
        channels['el.color'] = makeChannel('el.color', [kf(0, '#000000'), kf(100, '#ffffff')], {
            valueType: 'color',
        });
        const mid = evaluator.evaluate('el.color', 50);
        // Midpoint should be approximately grey
        expect(mid).toMatch(/^#[0-9a-f]{6}$/i);
        // Each component should be approximately 128 (0x80)
        const r = parseInt((mid as string).slice(1, 3), 16);
        expect(r).toBeGreaterThanOrEqual(126);
        expect(r).toBeLessThanOrEqual(130);
    });

    it('invalidates cache when channel changes', () => {
        channels['el.x'] = makeChannel('el.x', [kf(0, 0), kf(100, 10)]);
        expect(evaluator.evaluate('el.x', 50)).toBeCloseTo(5);

        // Update the channel with different keyframes
        channels['el.x'] = makeChannel('el.x', [kf(0, 0), kf(100, 20)]);
        evaluator.invalidateChannel('el.x');
        expect(evaluator.evaluate('el.x', 50)).toBeCloseTo(10);
    });

    it('invalidateAll clears the entire cache', () => {
        channels['el.x'] = makeChannel('el.x', [kf(0, 1)]);
        channels['el.y'] = makeChannel('el.y', [kf(0, 2)]);

        expect(evaluator.evaluate('el.x', 0)).toBe(1);
        expect(evaluator.evaluate('el.y', 0)).toBe(2);

        // Replace channels entirely
        channels = {
            'el.x': makeChannel('el.x', [kf(0, 10)]),
            'el.y': makeChannel('el.y', [kf(0, 20)]),
        };
        evaluator.setChannelProvider((id) => channels[id]);
        evaluator.invalidateAll();

        expect(evaluator.evaluate('el.x', 0)).toBe(10);
        expect(evaluator.evaluate('el.y', 0)).toBe(20);
    });

    it('returns undefined for non-existent channels', () => {
        expect(evaluator.evaluate('no.such.channel', 0)).toBeUndefined();
    });

    it('produces different values at different targetTime ticks', () => {
        channels['el.scale'] = makeChannel('el.scale', [kf(0, 1), kf(96, 2)]);
        const v0 = evaluator.evaluate('el.scale', 0);
        const v48 = evaluator.evaluate('el.scale', 48);
        const v96 = evaluator.evaluate('el.scale', 96);
        expect(v0).toBe(1);
        expect(v48).toBeCloseTo(1.5);
        expect(v96).toBe(2);
        expect(v0).not.toBe(v48);
        expect(v48).not.toBe(v96);
    });
});
