/**
 * Cubic Bezier Evaluation — 1D cubic bezier solver for keyframe interpolation.
 *
 * Animation bezier curves are parametric: each control point has a time (tick)
 * component and a value component. Given a normalized time `localT` within a
 * segment, we first solve for the bezier parameter `u` on the time axis, then
 * evaluate the value axis at that `u`.
 */

import type { BezierHandle } from '@automation/types';

// ---------------------------------------------------------------------------
// Low-level bezier math
// ---------------------------------------------------------------------------

/** Evaluate a 1D cubic bezier at parameter u. */
export function evaluateCubicBezier1D(u: number, p0: number, p1: number, p2: number, p3: number): number {
    const inv = 1 - u;
    return inv * inv * inv * p0
        + 3 * inv * inv * u * p1
        + 3 * inv * u * u * p2
        + u * u * u * p3;
}

/** Evaluate the derivative of a 1D cubic bezier at parameter u. */
function cubicBezierDerivative(u: number, p0: number, p1: number, p2: number, p3: number): number {
    const inv = 1 - u;
    return 3 * inv * inv * (p1 - p0)
        + 6 * inv * u * (p2 - p1)
        + 3 * u * u * (p3 - p2);
}

/**
 * Solve for the bezier parameter `u` such that the time-axis bezier evaluates
 * to `targetX`. Uses Newton-Raphson with bisection fallback.
 *
 * @param targetX - Normalized time value in [0, 1]
 * @param x0 - Time-axis control point 0 (always 0 for normalized segments)
 * @param x1 - Time-axis control point 1
 * @param x2 - Time-axis control point 2
 * @param x3 - Time-axis control point 3 (always 1 for normalized segments)
 * @param tolerance - Convergence tolerance (default 1e-6)
 * @returns The parametric u value
 */
export function solveCubicBezierT(
    targetX: number,
    x0: number,
    x1: number,
    x2: number,
    x3: number,
    tolerance: number = 1e-6,
): number {
    // Quick bounds check
    if (targetX <= x0) return 0;
    if (targetX >= x3) return 1;

    // Newton-Raphson iteration
    let u = targetX; // Good initial guess for normalized curves
    for (let i = 0; i < 8; i++) {
        const f = evaluateCubicBezier1D(u, x0, x1, x2, x3) - targetX;
        if (Math.abs(f) < tolerance) return u;

        const df = cubicBezierDerivative(u, x0, x1, x2, x3);
        if (Math.abs(df) < 1e-10) break; // Derivative too small, switch to bisection
        u -= f / df;
        u = Math.max(0, Math.min(1, u)); // Clamp to valid range
    }

    // Bisection fallback for robustness
    let lo = 0;
    let hi = 1;
    u = targetX;
    for (let i = 0; i < 32; i++) {
        const f = evaluateCubicBezier1D(u, x0, x1, x2, x3) - targetX;
        if (Math.abs(f) < tolerance) return u;
        if (f > 0) {
            hi = u;
        } else {
            lo = u;
        }
        u = (lo + hi) / 2;
    }

    return u;
}

// ---------------------------------------------------------------------------
// High-level segment evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a bezier-interpolated segment between two keyframes.
 *
 * @param localT - Normalized position within the segment [0, 1]
 * @param prevTick - Tick of the left keyframe
 * @param prevValue - Numeric value of the left keyframe
 * @param prevRightHandle - Right (outgoing) handle of the left keyframe
 * @param nextTick - Tick of the right keyframe
 * @param nextValue - Numeric value of the right keyframe
 * @param nextLeftHandle - Left (incoming) handle of the right keyframe
 * @returns Interpolated value
 */
export function evaluateSegmentBezier(
    localT: number,
    prevTick: number,
    prevValue: number,
    prevRightHandle: BezierHandle,
    nextTick: number,
    nextValue: number,
    nextLeftHandle: BezierHandle,
): number {
    const span = nextTick - prevTick;
    if (span <= 0) return nextValue;

    // Construct control points in normalized time [0,1] and absolute value space
    const x0 = 0;
    const x1 = Math.max(0, Math.min(1, prevRightHandle.dt / span)); // Clamp handles to segment
    const x2 = Math.max(0, Math.min(1, 1 + nextLeftHandle.dt / span));
    const x3 = 1;

    const y0 = prevValue;
    const y1 = prevValue + prevRightHandle.dv;
    const y2 = nextValue + nextLeftHandle.dv;
    const y3 = nextValue;

    // Solve for bezier parameter u at the given time position
    const u = solveCubicBezierT(localT, x0, x1, x2, x3);

    // Evaluate value at that parameter
    return evaluateCubicBezier1D(u, y0, y1, y2, y3);
}
