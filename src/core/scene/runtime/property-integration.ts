import type { PropertyIntegrationOptions } from '../../../../packages/plugin-sdk/src/scene';

export const PROPERTY_INTEGRATION_DEFAULTS = Object.freeze({
    absoluteTolerance: 1e-6,
    relativeTolerance: 1e-4,
    maxEvaluations: 2049,
    maxAllowedEvaluations: 16385,
    initialSegments: 16,
    maxDepth: 24,
});

export type PropertyIntegrationFailure =
    | Readonly<{ reason: 'invalid-options'; message: string }>
    | Readonly<{ reason: 'sample-failed'; message: string }>
    | Readonly<{ reason: 'budget-exhausted'; message: string }>;

export type PropertyIntegrationResult =
    Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; error: PropertyIntegrationFailure }>;

type SampleResult = Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; message: string }>;

/** Exact-endpoint cumulative memo for repeated random-access property integrals. */
export class CumulativePropertyIntegral {
    private points: Array<{ time: number; area: number }> = [];
    private samples = new Map<number, SampleResult>();
    private static readonly MAX_POINTS = 4096;
    private static readonly MAX_SAMPLES = 16385;

    integrate(
        sample: (timeSeconds: number) => SampleResult,
        startSeconds: number,
        endSeconds: number
    ): PropertyIntegrationResult {
        if (startSeconds === endSeconds) return { ok: true, value: 0 };
        const cachedSample = (time: number): SampleResult => {
            const cached = this.samples.get(time);
            if (cached) return cached;
            const result = sample(time);
            if (result.ok) {
                if (this.samples.size >= CumulativePropertyIntegral.MAX_SAMPLES) this.samples.clear();
                this.samples.set(time, result);
            }
            return result;
        };
        if (!this.points.length) {
            const first = integratePropertySampler(cachedSample, startSeconds, endSeconds);
            if (first.ok)
                this.points = [
                    { time: startSeconds, area: 0 },
                    { time: endSeconds, area: first.value },
                ];
            return first;
        }
        const start = this.areaAt(cachedSample, startSeconds);
        if (!start.ok) return start;
        const end = this.areaAt(cachedSample, endSeconds);
        if (!end.ok) return end;
        const difference = end.value - start.value;
        if (Math.abs(difference) <= 1e-9 * Math.max(1, Math.abs(start.value), Math.abs(end.value))) {
            return integratePropertySampler(cachedSample, startSeconds, endSeconds);
        }
        return { ok: true, value: difference };
    }

    private areaAt(sample: (timeSeconds: number) => SampleResult, time: number): PropertyIntegrationResult {
        let lo = 0;
        let hi = this.points.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.points[mid].time < time) lo = mid + 1;
            else hi = mid;
        }
        if (this.points[lo]?.time === time) return { ok: true, value: this.points[lo].area };
        const left = this.points[lo - 1];
        const right = this.points[lo];
        const anchor = !left ? right : !right || time - left.time <= right.time - time ? left : right;
        const low = Math.min(anchor.time, time);
        const high = Math.max(anchor.time, time);
        const interval = integratePropertySampler(sample, low, high);
        if (!interval.ok) return interval;
        const area = anchor.area + (time >= anchor.time ? interval.value : -interval.value);
        if (this.points.length >= CumulativePropertyIntegral.MAX_POINTS) {
            this.points = [{ time, area }];
        } else {
            this.points.splice(lo, 0, { time, area });
        }
        return { ok: true, value: area };
    }
}

function resolveOptions(
    options?: PropertyIntegrationOptions
):
    | Readonly<{ ok: true; absoluteTolerance: number; relativeTolerance: number; maxEvaluations: number }>
    | Readonly<{ ok: false; message: string }> {
    const absoluteTolerance = options?.absoluteTolerance ?? PROPERTY_INTEGRATION_DEFAULTS.absoluteTolerance;
    const relativeTolerance = options?.relativeTolerance ?? PROPERTY_INTEGRATION_DEFAULTS.relativeTolerance;
    const maxEvaluations = options?.maxEvaluations ?? PROPERTY_INTEGRATION_DEFAULTS.maxEvaluations;
    if (!Number.isFinite(absoluteTolerance) || absoluteTolerance <= 0)
        return { ok: false, message: 'absoluteTolerance must be positive and finite' };
    if (!Number.isFinite(relativeTolerance) || relativeTolerance < 0)
        return { ok: false, message: 'relativeTolerance must be non-negative and finite' };
    if (
        !Number.isInteger(maxEvaluations) ||
        maxEvaluations < PROPERTY_INTEGRATION_DEFAULTS.initialSegments * 2 + 1 ||
        maxEvaluations > PROPERTY_INTEGRATION_DEFAULTS.maxAllowedEvaluations
    ) {
        return {
            ok: false,
            message: `maxEvaluations must be an integer between ${PROPERTY_INTEGRATION_DEFAULTS.initialSegments * 2 + 1} and ${PROPERTY_INTEGRATION_DEFAULTS.maxAllowedEvaluations}`,
        };
    }
    return { ok: true, absoluteTolerance, relativeTolerance, maxEvaluations };
}

const simpson = (start: number, end: number, left: number, middle: number, right: number): number =>
    ((end - start) / 6) * (left + 4 * middle + right);

/** Deterministic adaptive integration over an opaque numeric sampler. */
export function integratePropertySampler(
    sample: (timeSeconds: number) => SampleResult,
    startSeconds: number,
    endSeconds: number,
    options?: PropertyIntegrationOptions
): PropertyIntegrationResult {
    const resolved = resolveOptions(options);
    if (!resolved.ok) return { ok: false, error: { reason: 'invalid-options', message: resolved.message } };
    if (startSeconds === endSeconds) return { ok: true, value: 0 };

    const cache = new Map<number, SampleResult>();
    const read = (time: number): SampleResult => {
        const cached = cache.get(time);
        if (cached) return cached;
        if (cache.size >= resolved.maxEvaluations)
            return { ok: false, message: `Property integration exceeded ${resolved.maxEvaluations} evaluations` };
        const result = sample(time);
        cache.set(time, result);
        return result;
    };

    const integrateSegment = (
        start: number,
        end: number,
        left: number,
        middle: number,
        right: number,
        whole: number,
        absoluteTolerance: number,
        depth: number
    ): PropertyIntegrationResult => {
        const center = (start + end) / 2;
        const leftMiddleTime = (start + center) / 2;
        const rightMiddleTime = (center + end) / 2;
        const leftMiddle = read(leftMiddleTime);
        if (!leftMiddle.ok)
            return {
                ok: false,
                error: {
                    reason: cache.size >= resolved.maxEvaluations ? 'budget-exhausted' : 'sample-failed',
                    message: leftMiddle.message,
                },
            };
        const rightMiddle = read(rightMiddleTime);
        if (!rightMiddle.ok)
            return {
                ok: false,
                error: {
                    reason: cache.size >= resolved.maxEvaluations ? 'budget-exhausted' : 'sample-failed',
                    message: rightMiddle.message,
                },
            };
        const leftArea = simpson(start, center, left, leftMiddle.value, middle);
        const rightArea = simpson(center, end, middle, rightMiddle.value, right);
        const refined = leftArea + rightArea;
        const threshold = 15 * (absoluteTolerance + resolved.relativeTolerance * Math.abs(refined));
        if (depth >= PROPERTY_INTEGRATION_DEFAULTS.maxDepth || Math.abs(refined - whole) <= threshold) {
            return { ok: true, value: refined + (refined - whole) / 15 };
        }
        const leftResult = integrateSegment(
            start,
            center,
            left,
            leftMiddle.value,
            middle,
            leftArea,
            absoluteTolerance / 2,
            depth + 1
        );
        if (!leftResult.ok) return leftResult;
        const rightResult = integrateSegment(
            center,
            end,
            middle,
            rightMiddle.value,
            right,
            rightArea,
            absoluteTolerance / 2,
            depth + 1
        );
        return rightResult.ok ? { ok: true, value: leftResult.value + rightResult.value } : rightResult;
    };

    const segmentCount = PROPERTY_INTEGRATION_DEFAULTS.initialSegments;
    const segmentWidth = (endSeconds - startSeconds) / segmentCount;
    let total = 0;
    for (let index = 0; index < segmentCount; index += 1) {
        const start = startSeconds + segmentWidth * index;
        const end = index === segmentCount - 1 ? endSeconds : startSeconds + segmentWidth * (index + 1);
        const middleTime = (start + end) / 2;
        const left = read(start);
        const middle = read(middleTime);
        const right = read(end);
        if (!left.ok)
            return {
                ok: false,
                error: {
                    reason: cache.size >= resolved.maxEvaluations ? 'budget-exhausted' : 'sample-failed',
                    message: left.message,
                },
            };
        if (!middle.ok)
            return {
                ok: false,
                error: {
                    reason: cache.size >= resolved.maxEvaluations ? 'budget-exhausted' : 'sample-failed',
                    message: middle.message,
                },
            };
        if (!right.ok)
            return {
                ok: false,
                error: {
                    reason: cache.size >= resolved.maxEvaluations ? 'budget-exhausted' : 'sample-failed',
                    message: right.message,
                },
            };
        const result = integrateSegment(
            start,
            end,
            left.value,
            middle.value,
            right.value,
            simpson(start, end, left.value, middle.value, right.value),
            resolved.absoluteTolerance / segmentCount,
            0
        );
        if (!result.ok) return result;
        total += result.value;
    }
    return { ok: true, value: total };
}
