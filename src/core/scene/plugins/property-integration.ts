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
