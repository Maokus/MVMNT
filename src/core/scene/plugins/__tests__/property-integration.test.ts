import { describe, expect, it } from 'vitest';
import { integratePropertySampler } from '../property-integration';

const sampler = (fn: (time: number) => number) => (time: number) => ({ ok: true as const, value: fn(time) });

describe('property integration', () => {
    it('integrates constant, linear, and negative values', () => {
        expect(
            integratePropertySampler(
                sampler(() => 3),
                0,
                2
            )
        ).toMatchObject({ ok: true, value: 6 });
        expect(
            integratePropertySampler(
                sampler((time) => time * 2),
                0,
                3
            )
        ).toMatchObject({ ok: true, value: 9 });
        expect(
            integratePropertySampler(
                sampler(() => -4),
                1,
                2.5
            )
        ).toMatchObject({ ok: true, value: -6 });
    });

    it('handles a stepped discontinuity without inspecting curve data', () => {
        const result = integratePropertySampler(
            sampler((time) => (time < 1 ? 2 : 6)),
            0,
            2,
            {
                absoluteTolerance: 1e-4,
            }
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBeCloseTo(8, 3);
    });

    it('returns zero without sampling for an empty range', () => {
        let calls = 0;
        const result = integratePropertySampler(
            () => {
                calls += 1;
                return { ok: true, value: 10 };
            },
            2,
            2
        );
        expect(result).toEqual({ ok: true, value: 0 });
        expect(calls).toBe(0);
    });

    it('reports invalid options, sample failures, and exhausted budgets', () => {
        expect(
            integratePropertySampler(
                sampler(() => 1),
                0,
                1,
                { absoluteTolerance: 0 }
            )
        ).toMatchObject({
            ok: false,
            error: { reason: 'invalid-options' },
        });
        expect(integratePropertySampler(() => ({ ok: false, message: 'unavailable' }), 0, 1)).toMatchObject({
            ok: false,
            error: { reason: 'sample-failed', message: 'unavailable' },
        });
        expect(
            integratePropertySampler(
                sampler((time) => Math.sin(997 * time)),
                0,
                1,
                { maxEvaluations: 33 }
            )
        ).toMatchObject({ ok: false, error: { reason: 'budget-exhausted' } });
    });
});
