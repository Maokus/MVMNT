import { describe, expect, it } from 'vitest';
import { CumulativePropertyIntegral, integratePropertySampler } from '@core/scene/runtime/property-integration';

const sampler = (fn: (time: number) => number) => (time: number) => ({ ok: true as const, value: fn(time) });

describe('property integration', () => {
    it('reuses exact cumulative endpoints without resampling and supports out-of-order requests', () => {
        const cache = new CumulativePropertyIntegral();
        let reads = 0;
        const sample = (time: number) => {
            reads += 1;
            return { ok: true as const, value: 2 * time + 3 };
        };
        expect(cache.integrate(sample, 0, 4)).toMatchObject({ ok: true, value: 28 });
        const firstReads = reads;
        expect(cache.integrate(sample, 0, 4)).toMatchObject({ ok: true, value: 28 });
        expect(reads).toBe(firstReads);
        expect(cache.integrate(sample, 1, 3)).toMatchObject({ ok: true, value: 14 });
        const secondReads = reads;
        expect(cache.integrate(sample, 1, 3)).toMatchObject({ ok: true, value: 14 });
        expect(reads).toBe(secondReads);
    });

    it('retains stepped-curve accuracy when cached endpoints are queried in either order', () => {
        const cache = new CumulativePropertyIntegral();
        const sample = sampler((time) => (time < 1 ? 2 : 6));
        const whole = cache.integrate(sample, 0, 2);
        const middle = cache.integrate(sample, 0.25, 1.75);
        expect(whole.ok && whole.value).toBeCloseTo(8, 3);
        expect(middle.ok && middle.value).toBeCloseTo(6, 3);
    });

    it('needs one new endpoint rather than one integration per note on the next frame', () => {
        const cache = new CumulativePropertyIntegral();
        let reads = 0;
        const sample = (time: number) => {
            reads += 1;
            return { ok: true as const, value: 90 + time };
        };
        const noteTimes = Array.from({ length: 100 }, (_, index) => index * 0.08);
        for (const noteTime of noteTimes)
            expect(cache.integrate(sample, Math.min(4, noteTime), Math.max(4, noteTime)).ok).toBe(true);
        const firstFrameReads = reads;
        for (const noteTime of noteTimes)
            expect(cache.integrate(sample, Math.min(4.01, noteTime), Math.max(4.01, noteTime)).ok).toBe(true);
        expect(reads - firstFrameReads).toBeLessThan(70);
    });

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
