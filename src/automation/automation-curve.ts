/**
 * AutomationCurve — evaluates an automation channel at a given tick.
 *
 * Hybrid interpolation model:
 *   Each segment between two keyframes has its own interpolation mode via
 *   the outgoing keyframe's `segmentInterpolation` field:
 *     - constant: hold the left keyframe's value (stepped)
 *     - linear:   lerp between keyframes
 *     - bezier:   cubic bezier evaluation using keyframe handles
 *     - semantic:  easing function with direction and optional parameters
 *
 *   When `segmentInterpolation` is absent (legacy data), falls back to
 *   the channel-level `interpolation` mode and per-keyframe `easingId`.
 *
 * Handle behavior:
 *   Handle data is always preserved on keyframes regardless of interpolation mode.
 *   Only bezier mode reads handle data for evaluation. Switching from bezier to
 *   a semantic mode and back restores the previous curve shape.
 *
 * Value types:
 *   - number:  direct interpolation
 *   - color:   per-component RGB(A) interpolation
 *   - boolean: always stepped, regardless of channel interpolation mode
 */

import type { AutomationChannel, AutomationKeyframe, AutomationInterpolation, AutomationValueType } from './types';
import { lerpColor } from './color-interpolation';
import { computeAutoHandles } from './interpolation-defaults';
import { evaluateSegmentBezier } from '@math/animation/cubic-bezier';
import { resolveParametricEasing } from '@math/animation/easing-parametric';
import easings from '@math/animation/easing';

type EasingFn = (t: number) => number;

/** Resolve a legacy easing function by its ID. Falls back to linear if unknown. */
function resolveEasing(easingId: string): EasingFn {
    const fn = (easings as Record<string, EasingFn | undefined>)[easingId];
    return fn ?? easings.linear;
}

/** Binary search: find the index of the last keyframe with tick <= targetTick. */
function findSegmentIndex(keyframes: readonly AutomationKeyframe[], targetTick: number): number {
    let lo = 0;
    let hi = keyframes.length - 1;
    let result = -1;

    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (keyframes[mid].tick <= targetTick) {
            result = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    return result;
}

export class AutomationCurve {
    private readonly keyframes: readonly AutomationKeyframe[];
    private readonly interpolation: AutomationInterpolation;
    private readonly valueType: AutomationValueType;

    constructor(channel: AutomationChannel) {
        this.keyframes = channel.keyframes;
        this.interpolation = channel.interpolation;
        this.valueType = channel.valueType;
    }

    /** Evaluate the channel value at the given tick. */
    evaluate(tick: number): unknown {
        const kfs = this.keyframes;

        if (kfs.length === 0) return undefined;
        if (kfs.length === 1) return kfs[0].value;

        // Before first keyframe: hold first value
        if (tick <= kfs[0].tick) return kfs[0].value;

        // After last keyframe: hold last value
        if (tick >= kfs[kfs.length - 1].tick) return kfs[kfs.length - 1].value;

        // Find the segment the tick falls into
        const prevIdx = findSegmentIndex(kfs, tick);
        const prev = kfs[prevIdx];
        const next = kfs[prevIdx + 1];

        if (!next) return prev.value;

        // Boolean values are always stepped
        if (this.valueType === 'boolean') return prev.value;

        // Compute local t within the segment
        const span = next.tick - prev.tick;
        if (span <= 0) return next.value;
        const localT = Math.max(0, Math.min(1, (tick - prev.tick) / span));

        // --- New hybrid interpolation path ---
        if (prev.segmentInterpolation) {
            return this.evaluateSegment(prevIdx, localT, prev, next);
        }

        // --- Legacy fallback ---
        return this.evaluateLegacy(localT, prev, next);
    }

    /**
     * Evaluate a segment using the new hybrid interpolation model.
     * Dispatches by the segment's interpolation mode.
     */
    private evaluateSegment(
        prevIdx: number,
        localT: number,
        prev: AutomationKeyframe,
        next: AutomationKeyframe,
    ): unknown {
        const interp = prev.segmentInterpolation!;
        const { mode, direction, params } = interp;

        // Constant (stepped): hold previous value
        if (mode === 'constant') return prev.value;

        // Linear: raw lerp, no easing
        if (mode === 'linear') {
            return this.interpolateValue(localT, prev, next);
        }

        // Bezier: cubic bezier evaluation using handles
        if (mode === 'bezier') {
            return this.evaluateBezierSegment(prevIdx, localT, prev, next);
        }

        // Semantic preset: resolve easing function, apply to t, then lerp
        const easingFn = resolveParametricEasing(mode, direction, params);
        if (easingFn) {
            const easedT = easingFn(localT);
            return this.interpolateValue(easedT, prev, next);
        }

        // Fallback to linear
        return this.interpolateValue(localT, prev, next);
    }

    /**
     * Evaluate a bezier-mode segment using cubic bezier curves and keyframe handles.
     */
    private evaluateBezierSegment(
        prevIdx: number,
        localT: number,
        prev: AutomationKeyframe,
        next: AutomationKeyframe,
    ): unknown {
        const kfs = this.keyframes;

        // Resolve handles — use explicit handles if present, or auto-compute
        const prevHandleType = prev.rightHandleType ?? 'auto_clamped';
        const nextHandleType = next.leftHandleType ?? 'auto_clamped';

        let prevRightHandle = prev.rightHandle;
        let nextLeftHandle = next.leftHandle;

        // Auto-compute handles when needed
        if (!prevRightHandle || prevHandleType === 'auto' || prevHandleType === 'auto_clamped') {
            const prevPrev = prevIdx > 0 ? kfs[prevIdx - 1] : null;
            const computed = computeAutoHandles(prevPrev, prev, next, prevHandleType === 'auto' ? 'auto' : 'auto_clamped');
            prevRightHandle = computed.right;
        }

        if (!nextLeftHandle || nextHandleType === 'auto' || nextHandleType === 'auto_clamped') {
            const nextNext = prevIdx + 2 < kfs.length ? kfs[prevIdx + 2] : null;
            const computed = computeAutoHandles(prev, next, nextNext, nextHandleType === 'auto' ? 'auto' : 'auto_clamped');
            nextLeftHandle = computed.left;
        }

        // For color values: bezier-interpolate each RGB(A) component independently
        if (this.valueType === 'color') {
            // Use simple eased interpolation for color bezier (the handle shape
            // is applied to t, then component-wise lerp — simpler than per-component bezier)
            const prevVal = typeof prev.value === 'number' ? prev.value : 0;
            const nextVal = typeof next.value === 'number' ? next.value : 0;
            const span = next.tick - prev.tick;
            if (span <= 0) return next.value;

            // Evaluate bezier for the t-mapping only
            const bezierT = evaluateSegmentBezier(
                localT, prev.tick, 0, prevRightHandle, next.tick, 1, nextLeftHandle,
            );
            return lerpColor(prev.value as string, next.value as string, Math.max(0, Math.min(1, bezierT)));
        }

        // Numeric: full bezier evaluation
        const prevVal = typeof prev.value === 'number' ? prev.value : 0;
        const nextVal = typeof next.value === 'number' ? next.value : 0;

        return evaluateSegmentBezier(
            localT, prev.tick, prevVal, prevRightHandle, next.tick, nextVal, nextLeftHandle,
        );
    }

    /** Legacy evaluation path: channel-level interpolation mode + per-keyframe easingId. */
    private evaluateLegacy(localT: number, prev: AutomationKeyframe, next: AutomationKeyframe): unknown {
        // Stepped interpolation: hold previous value
        if (this.interpolation === 'stepped') return prev.value;

        // Apply easing
        const easedT =
            this.interpolation === 'eased'
                ? resolveEasing(prev.easingId)(localT)
                : localT;

        return this.interpolateValue(easedT, prev, next);
    }

    /** Interpolate between two keyframe values at a given t. */
    private interpolateValue(t: number, prev: AutomationKeyframe, next: AutomationKeyframe): unknown {
        if (this.valueType === 'color') {
            return lerpColor(prev.value as string, next.value as string, t);
        }

        // Numeric interpolation
        const a = prev.value as number;
        const b = next.value as number;
        return a + (b - a) * t;
    }

    /** Check if a keyframe exists at exactly the given tick (within tolerance). */
    hasKeyframeAt(tick: number, tolerance: number = 0.5): boolean {
        if (this.keyframes.length === 0) return false;
        const idx = findSegmentIndex(this.keyframes, tick + tolerance);
        if (idx < 0) return false;
        return Math.abs(this.keyframes[idx].tick - tick) < tolerance;
    }

    /** Get the keyframe count. */
    get length(): number {
        return this.keyframes.length;
    }
}
