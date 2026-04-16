/**
 * Parameterized Easing — factories for easing functions that accept configuration.
 *
 * The existing easing.ts has hardcoded constants for Back (overshoot=1.70158)
 * and Elastic (amplitude/period). This module provides parameterized versions
 * and a resolver that maps (mode, direction, params) → easing function.
 */

import type {
    EasingDirection,
    SegmentInterpolationMode,
    SegmentInterpolationParams,
} from '@automation/types';
import {
    DEFAULT_BACK_OVERSHOOT,
    DEFAULT_ELASTIC_AMPLITUDE,
    DEFAULT_ELASTIC_PERIOD,
} from '@automation/interpolation-defaults';
import easings from './easing';

type EasingFn = (t: number) => number;

// ---------------------------------------------------------------------------
// Parameterized factories
// ---------------------------------------------------------------------------

/** Create Back easing functions with a custom overshoot factor. */
export function createBackEasing(overshoot: number = DEFAULT_BACK_OVERSHOOT): {
    easeIn: EasingFn; easeOut: EasingFn; easeInOut: EasingFn;
} {
    const c3 = overshoot + 1;
    const c2 = overshoot * 1.525;
    return {
        easeIn: (x) => c3 * x * x * x - overshoot * x * x,
        easeOut: (x) => 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2),
        easeInOut: (x) => x < 0.5
            ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
            : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
    };
}

/** Create Elastic easing functions with custom amplitude and period. */
export function createElasticEasing(
    amplitude: number = DEFAULT_ELASTIC_AMPLITUDE,
    period: number = DEFAULT_ELASTIC_PERIOD,
): { easeIn: EasingFn; easeOut: EasingFn; easeInOut: EasingFn } {
    const a = Math.max(1, amplitude);
    const p = period;
    const s = (p / (2 * Math.PI)) * Math.asin(1 / a);

    return {
        easeIn: (x) => {
            if (x === 0 || x === 1) return x;
            return -(a * Math.pow(2, 10 * (x - 1)) * Math.sin(((x - 1) - s) * (2 * Math.PI) / p));
        },
        easeOut: (x) => {
            if (x === 0 || x === 1) return x;
            return a * Math.pow(2, -10 * x) * Math.sin((x - s) * (2 * Math.PI) / p) + 1;
        },
        easeInOut: (x) => {
            if (x === 0 || x === 1) return x;
            if (x < 0.5) {
                return -(a * Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 10 - s * 2) * Math.PI / p)) / 2;
            }
            return (a * Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 10 - s * 2) * Math.PI / p)) / 2 + 1;
        },
    };
}

/** Create Bounce easing functions (no parameters, but structured for consistency). */
export function createBounceEasing(): {
    easeIn: EasingFn; easeOut: EasingFn; easeInOut: EasingFn;
} {
    const bounceOut: EasingFn = (x) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
        if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
    };

    return {
        easeIn: (x) => 1 - bounceOut(1 - x),
        easeOut: bounceOut,
        easeInOut: (x) => x < 0.5
            ? (1 - bounceOut(1 - 2 * x)) / 2
            : (1 + bounceOut(2 * x - 1)) / 2,
    };
}

// ---------------------------------------------------------------------------
// Mode → default direction for 'auto'
// ---------------------------------------------------------------------------

/** Dynamic families default to ease_out; smooth families default to ease_in_out. */
const DYNAMIC_MODES: ReadonlySet<SegmentInterpolationMode> = new Set(['back', 'bounce', 'elastic']);

function resolveAutoDirection(mode: SegmentInterpolationMode): 'ease_in' | 'ease_out' | 'ease_in_out' {
    return DYNAMIC_MODES.has(mode) ? 'ease_out' : 'ease_in_out';
}

// ---------------------------------------------------------------------------
// Standard (non-parameterized) easing lookup
// ---------------------------------------------------------------------------

/** Map (mode, resolved direction) → easing ID in the standard library. */
function standardEasingId(mode: SegmentInterpolationMode, direction: 'ease_in' | 'ease_out' | 'ease_in_out'): string {
    const familyName = mode.charAt(0).toUpperCase() + mode.slice(1);
    switch (direction) {
        case 'ease_in': return `easeIn${familyName}`;
        case 'ease_out': return `easeOut${familyName}`;
        case 'ease_in_out': return `easeInOut${familyName}`;
    }
}

// ---------------------------------------------------------------------------
// Master resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a segment interpolation descriptor to a concrete easing function.
 *
 * Returns null for 'bezier' mode (caller must use cubic bezier evaluation).
 * Returns identity for 'linear'. Returns step function for 'constant'.
 * For semantic presets, returns the easing function with direction and params applied.
 */
export function resolveParametricEasing(
    mode: SegmentInterpolationMode,
    direction: EasingDirection,
    params?: SegmentInterpolationParams,
): EasingFn | null {
    if (mode === 'bezier') return null;
    if (mode === 'constant') return () => 0; // Stepped: always returns start value
    if (mode === 'linear') return (t) => t;

    const resolvedDir = direction === 'auto' ? resolveAutoDirection(mode) : direction;

    // Parameterized modes: use factories when custom params are provided
    if (mode === 'back') {
        const hasCustom = params?.overshoot !== undefined;
        if (hasCustom) {
            const fns = createBackEasing(params!.overshoot);
            return fns[directionKey(resolvedDir)];
        }
    }

    if (mode === 'elastic') {
        const hasCustom = params?.amplitude !== undefined || params?.period !== undefined;
        if (hasCustom) {
            const fns = createElasticEasing(params?.amplitude, params?.period);
            return fns[directionKey(resolvedDir)];
        }
    }

    if (mode === 'bounce') {
        // Bounce has no params currently but we create it for consistency
        // Fall through to standard lookup (same functions)
    }

    // Standard (non-parameterized): look up from the existing easing library
    const id = standardEasingId(mode, resolvedDir);
    const fn = (easings as Record<string, EasingFn | undefined>)[id];
    return fn ?? ((t: number) => t);
}

function directionKey(dir: 'ease_in' | 'ease_out' | 'ease_in_out'): 'easeIn' | 'easeOut' | 'easeInOut' {
    switch (dir) {
        case 'ease_in': return 'easeIn';
        case 'ease_out': return 'easeOut';
        case 'ease_in_out': return 'easeInOut';
    }
}
