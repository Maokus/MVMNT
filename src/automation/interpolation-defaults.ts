/**
 * Interpolation Defaults — constants and auto-handle computation.
 *
 * Provides sensible defaults for the hybrid interpolation system and
 * computes auto bezier handles using Catmull-Rom tangents.
 */

import type {
    AutomationKeyframe,
    BezierHandle,
    HandleType,
    SegmentInterpolation,
} from './types';

// Default constants are defined in types.ts to avoid circular imports.
// We re-export them here for convenience.
export { DEFAULT_SEGMENT_INTERPOLATION } from './types';

export const DEFAULT_HANDLE_TYPE: HandleType = 'auto_clamped';

export const DEFAULT_BACK_OVERSHOOT = 1.70158;
export const DEFAULT_ELASTIC_AMPLITUDE = 1.0;
export const DEFAULT_ELASTIC_PERIOD = 0.3;

// ---------------------------------------------------------------------------
// Auto handle computation
// ---------------------------------------------------------------------------

/**
 * Compute auto bezier handles for a keyframe using Catmull-Rom tangents.
 *
 * The tangent at keyframe `curr` is derived from the values and ticks of
 * its neighbors. Handle length is 1/3 of the span to each neighbor,
 * which produces a smooth curve equivalent to Catmull-Rom interpolation.
 *
 * For `auto_clamped`, the tangent is additionally clamped so the curve
 * does not overshoot the value bounds of adjacent keyframes.
 *
 * @param prev - The previous keyframe (null if curr is the first)
 * @param curr - The keyframe to compute handles for
 * @param next - The next keyframe (null if curr is the last)
 * @param handleType - 'auto' or 'auto_clamped'
 * @returns { left, right } handle offsets
 */
export function computeAutoHandles(
    prev: AutomationKeyframe | null,
    curr: AutomationKeyframe,
    next: AutomationKeyframe | null,
    handleType: 'auto' | 'auto_clamped' = 'auto_clamped',
): { left: BezierHandle; right: BezierHandle } {
    const currVal = typeof curr.value === 'number' ? curr.value : 0;
    const prevVal = prev ? (typeof prev.value === 'number' ? prev.value : 0) : currVal;
    const nextVal = next ? (typeof next.value === 'number' ? next.value : 0) : currVal;

    const prevTick = prev ? prev.tick : curr.tick;
    const nextTick = next ? next.tick : curr.tick;

    // Compute tangent slope using Catmull-Rom formula
    const totalSpan = nextTick - prevTick;
    let slope = totalSpan > 0 ? (nextVal - prevVal) / totalSpan : 0;

    // Auto-clamped: prevent overshoot by zeroing tangent at local extrema
    if (handleType === 'auto_clamped') {
        const isLocalExtremum =
            (prev && next && (currVal >= prevVal) !== (currVal < nextVal)) ||
            (prev && !next) ||
            (!prev && next);

        if (prev && next) {
            // If the current value is a local min or max, flatten tangent
            if ((currVal <= prevVal && currVal <= nextVal) ||
                (currVal >= prevVal && currVal >= nextVal)) {
                slope = 0;
            }
        }

        // Clamp tangent so the curve stays within the adjacent value range
        if (prev && next && slope !== 0) {
            const leftSpan = curr.tick - prevTick;
            const rightSpan = nextTick - curr.tick;
            const leftDv = slope * leftSpan / 3;
            const rightDv = slope * rightSpan / 3;

            // Ensure handles don't overshoot adjacent values
            const minAdj = Math.min(prevVal, nextVal);
            const maxAdj = Math.max(prevVal, nextVal);
            if (currVal - leftDv < minAdj || currVal - leftDv > maxAdj) {
                const safeLeftDv = currVal > prevVal
                    ? Math.min(leftDv, (currVal - prevVal))
                    : Math.max(leftDv, (currVal - prevVal));
                slope = safeLeftDv * 3 / leftSpan;
            }
            if (currVal + rightDv < minAdj || currVal + rightDv > maxAdj) {
                const safeRightDv = currVal < nextVal
                    ? Math.min(rightDv, (nextVal - currVal))
                    : Math.max(rightDv, (nextVal - currVal));
                slope = safeRightDv * 3 / rightSpan;
            }
        }
    }

    // Handle lengths are 1/3 of segment span
    const leftSpan = prev ? (curr.tick - prevTick) / 3 : 0;
    const rightSpan = next ? (nextTick - curr.tick) / 3 : 0;

    return {
        left: { dt: -leftSpan, dv: -slope * leftSpan },
        right: { dt: rightSpan, dv: slope * rightSpan },
    };
}
