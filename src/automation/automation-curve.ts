/**
 * AutomationCurve — evaluates an automation channel at a given tick.
 *
 * Supports three interpolation modes:
 *   - linear: lerp between keyframes
 *   - stepped: hold previous keyframe value until next
 *   - eased: lerp with per-keyframe easing function applied to t
 *
 * Value types:
 *   - number: direct interpolation
 *   - color: per-component RGB(A) interpolation
 *   - boolean: always stepped, regardless of channel interpolation mode
 */

import type { AutomationChannel, AutomationKeyframe, AutomationInterpolation, AutomationValueType } from './types';
import { lerpColor } from './color-interpolation';
import easings from '@animation/easing';

type EasingFn = (t: number) => number;

/** Resolve an easing function by its ID. Falls back to linear if unknown. */
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

        // Stepped interpolation: hold previous value
        if (this.interpolation === 'stepped') return prev.value;

        // Compute local t within the segment
        const span = next.tick - prev.tick;
        if (span <= 0) return next.value;
        const localT = (tick - prev.tick) / span;

        // Apply easing
        const easedT =
            this.interpolation === 'eased'
                ? resolveEasing(prev.easingId)(Math.max(0, Math.min(1, localT)))
                : Math.max(0, Math.min(1, localT));

        // Interpolate based on value type
        if (this.valueType === 'color') {
            return lerpColor(prev.value as string, next.value as string, easedT);
        }

        // Numeric interpolation
        const a = prev.value as number;
        const b = next.value as number;
        return a + (b - a) * easedT;
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
