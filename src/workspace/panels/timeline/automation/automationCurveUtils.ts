/**
 * Pure math and rendering-data helpers for AutomationCurvePane.
 * No React dependencies — all functions are deterministic given their inputs.
 */

import { computeAutoHandles } from '@automation/interpolation-defaults';
import { evaluateSegmentBezier } from '@math/animation/cubic-bezier';
import { resolveParametricEasing } from '@math/animation/easing-parametric';
import easings from '@math/animation/easing';
import type { AutomationChannel, HandleType } from '@automation/types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PADDING_Y = 8;
export const CURVE_SAMPLE_COUNT = 150;
export const COMPLEX_MODE_MIN_SAMPLES = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

export type EasingFn = (t: number) => number;

export interface GridTick {
    value: number;
    label: string;
}

export interface CurveSegmentData {
    tick: number;
    points: string;
}

export interface HandleVisualData {
    tick: number;
    kfX: number;
    kfY: number;
    leftX: number;
    leftY: number;
    rightX: number;
    rightY: number;
    showLeft: boolean;
    showRight: boolean;
    leftIsAuto: boolean;
    rightIsAuto: boolean;
}

// ─── Legacy easing ────────────────────────────────────────────────────────────

export function resolveLegacyEasing(id: string): EasingFn {
    const fn = (easings as Record<string, EasingFn | undefined>)[id];
    return fn ?? easings.linear;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Map a value in [minVal, maxVal] to a pixel y-coordinate inside the pane. */
export function valueToYCoord(
    val: number,
    minVal: number,
    maxVal: number,
    height: number,
): number {
    const t = (val - minVal) / (maxVal - minVal);
    return height - PADDING_Y - t * (height - PADDING_Y * 2);
}

/** Map a pixel y-coordinate back to a value in [frozenMin, frozenMax]. */
export function yCoordToValue(
    y: number,
    frozenMin: number,
    frozenMax: number,
    height: number,
): number {
    const t = (height - PADDING_Y - y) / (height - PADDING_Y * 2);
    return frozenMin + t * (frozenMax - frozenMin);
}

// ─── Auto value-range computation ─────────────────────────────────────────────

/**
 * Compute the auto-fit value range for the pane.
 * Includes bezier handle absolute values so handles remain in view.
 */
export function computeAutoRange(
    channel: AutomationChannel,
    propertyMin?: number,
    propertyMax?: number,
): { minVal: number; maxVal: number } {
    if (channel.valueType === 'boolean' || channel.valueType === 'color') {
        return { minVal: 0, maxVal: 1 };
    }

    const kfs = channel.keyframes;
    const vals = kfs.map((kf) => (typeof kf.value === 'number' ? kf.value : 0));
    if (vals.length === 0) {
        return { minVal: propertyMin ?? 0, maxVal: propertyMax ?? 1 };
    }

    // Expand value bounds to include bezier handle positions
    for (let i = 0; i < kfs.length; i++) {
        const kf = kfs[i];
        const val = typeof kf.value === 'number' ? kf.value : 0;
        const prev = i > 0 ? kfs[i - 1] : null;
        const next = i < kfs.length - 1 ? kfs[i + 1] : null;
        const showLeft = i > 0 && kfs[i - 1].segmentInterpolation?.mode === 'bezier';
        const showRight = i < kfs.length - 1 && kf.segmentInterpolation?.mode === 'bezier';

        if (showLeft) {
            const leftType = kf.leftHandleType ?? 'auto_clamped';
            const leftIsAuto = leftType === 'auto' || leftType === 'auto_clamped';
            let dv: number;
            if (!kf.leftHandle || leftIsAuto) {
                const c = computeAutoHandles(prev, kf, next, leftType === 'auto' ? 'auto' : 'auto_clamped');
                dv = c.left.dv;
            } else if (leftType === 'vector' && prev) {
                dv = ((typeof prev.value === 'number' ? prev.value : 0) - val) / 3;
            } else {
                dv = kf.leftHandle.dv;
            }
            vals.push(val + dv);
        }

        if (showRight) {
            const rightType = kf.rightHandleType ?? 'auto_clamped';
            const rightIsAuto = rightType === 'auto' || rightType === 'auto_clamped';
            let dv: number;
            if (!kf.rightHandle || rightIsAuto) {
                const c = computeAutoHandles(prev, kf, next, rightType === 'auto' ? 'auto' : 'auto_clamped');
                dv = c.right.dv;
            } else if (rightType === 'vector' && next) {
                dv = ((typeof next.value === 'number' ? next.value : 0) - val) / 3;
            } else {
                dv = kf.rightHandle.dv;
            }
            vals.push(val + dv);
        }
    }

    let mn = Math.min(...vals);
    let mx = Math.max(...vals);

    if (mn === mx) {
        mn -= 0.5;
        mx += 0.5;
    }

    const pad = (mx - mn) * 0.1;
    let paddedMin = mn - pad;
    let paddedMax = mx + pad;

    if (propertyMin !== undefined) paddedMin = Math.max(paddedMin, propertyMin);
    if (propertyMax !== undefined) paddedMax = Math.min(paddedMax, propertyMax);

    return { minVal: paddedMin, maxVal: paddedMax };
}

/** Enforce a minimum visual span equal to one property step. */
export function enforceMinSpan(mn: number, mx: number, propertyStep?: number): [number, number] {
    if (propertyStep === undefined) return [mn, mx];
    const span = mx - mn;
    if (span >= propertyStep) return [mn, mx];
    const mid = (mn + mx) / 2;
    return [mid - propertyStep / 2, mid + propertyStep / 2];
}

// ─── Nice y-axis tick generation ──────────────────────────────────────────────

/**
 * Nearest "nice" number (1, 2, 5, 10, 20 …).
 * `round = true` snaps to closest; `round = false` rounds up to the next boundary.
 */
function niceNumber(n: number, round: boolean): number {
    if (n === 0) return 0;
    const exp = Math.floor(Math.log10(Math.abs(n)));
    const f = Math.abs(n) / Math.pow(10, exp);
    let nf: number;
    if (round) {
        if (f < 1.5) nf = 1;
        else if (f < 3) nf = 2;
        else if (f < 7) nf = 5;
        else nf = 10;
    } else {
        if (f <= 1) nf = 1;
        else if (f <= 2) nf = 2;
        else if (f <= 5) nf = 5;
        else nf = 10;
    }
    return nf * Math.pow(10, exp);
}

function formatTickLabel(value: number, step: number): string {
    if (step >= 10) return String(Math.round(value));
    if (step >= 1) return value.toFixed(0);
    const decimals = Math.max(0, Math.ceil(-Math.log10(step + 1e-10)));
    return value.toFixed(Math.min(decimals, 4));
}

/**
 * Generate nicely-spaced y-axis ticks for [minVal, maxVal].
 *
 * Tick values sit at round numbers (e.g. 0, 0.5, 1.0 or 0, 10, 20) derived
 * from the current display range, so they move with the scale — just like a
 * real chart axis — rather than staying at fixed fractional positions.
 */
export function generateYTicks(minVal: number, maxVal: number, targetCount = 5): GridTick[] {
    const range = maxVal - minVal;
    if (range <= 0) {
        return [{ value: minVal, label: formatTickLabel(minVal, 1) }];
    }

    const step = niceNumber(range / (targetCount - 1), true);
    const tickMin = Math.ceil(minVal / step) * step;
    const tickMax = Math.floor(maxVal / step) * step;
    const nSteps = Math.round((tickMax - tickMin) / step);

    const ticks: GridTick[] = [];
    for (let i = 0; i <= nSteps; i++) {
        // Integer-step multiplication avoids floating-point accumulation
        const v = tickMin + i * step;
        ticks.push({ value: v, label: formatTickLabel(v, step) });
    }
    return ticks;
}

// ─── Curve segment path sampling ──────────────────────────────────────────────

/** Sample each keyframe-to-keyframe segment into a polyline points string. */
export function buildCurveSegments(
    channel: AutomationChannel,
    toX: (tick: number, width: number) => number,
    width: number,
    valueToY: (val: number) => number,
): CurveSegmentData[] {
    const kfs = channel.keyframes;
    if (kfs.length < 2) return [];

    const result: CurveSegmentData[] = [];

    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        const aVal = typeof a.value === 'number' ? a.value : 0;
        const bVal = typeof b.value === 'number' ? b.value : 0;
        const interp = a.segmentInterpolation;
        const base = Math.max(4, Math.round(CURVE_SAMPLE_COUNT / Math.max(1, kfs.length - 1)));
        const isComplexMode =
            interp?.mode === 'elastic' || interp?.mode === 'bounce' || interp?.mode === 'back';
        const segSamples = isComplexMode ? Math.max(base, COMPLEX_MODE_MIN_SAMPLES) : base;

        const pts: string[] = [];

        if (interp) {
            if (interp.mode === 'constant') {
                const xA = toX(a.tick, width);
                const yA = valueToY(aVal);
                const xB = toX(b.tick, width);
                const yB = valueToY(bVal);
                pts.push(`${xA.toFixed(1)},${yA.toFixed(1)}`);
                pts.push(`${xB.toFixed(1)},${yA.toFixed(1)}`);
                pts.push(`${xB.toFixed(1)},${yB.toFixed(1)}`);
                result.push({ tick: a.tick, points: pts.join(' ') });
                continue;
            }

            if (interp.mode === 'bezier') {
                const prevHandleType = a.rightHandleType ?? 'auto_clamped';
                const nextHandleType = b.leftHandleType ?? 'auto_clamped';
                let rHandle = a.rightHandle;
                let lHandle = b.leftHandle;

                if (!rHandle || prevHandleType === 'auto' || prevHandleType === 'auto_clamped') {
                    const prevPrev = i > 0 ? kfs[i - 1] : null;
                    const computed = computeAutoHandles(
                        prevPrev, a, b,
                        prevHandleType === 'auto' ? 'auto' : 'auto_clamped',
                    );
                    rHandle = computed.right;
                } else if (prevHandleType === 'vector') {
                    const span = b.tick - a.tick;
                    rHandle = { dt: span / 3, dv: (bVal - aVal) / 3 };
                }

                if (!lHandle || nextHandleType === 'auto' || nextHandleType === 'auto_clamped') {
                    const nextNext = i + 2 < kfs.length ? kfs[i + 2] : null;
                    const computed = computeAutoHandles(
                        a, b, nextNext,
                        nextHandleType === 'auto' ? 'auto' : 'auto_clamped',
                    );
                    lHandle = computed.left;
                } else if (nextHandleType === 'vector') {
                    const span = b.tick - a.tick;
                    lHandle = { dt: -span / 3, dv: -(bVal - aVal) / 3 };
                }

                for (let s = 0; s <= segSamples; s++) {
                    const localT = s / segSamples;
                    const val = evaluateSegmentBezier(localT, a.tick, aVal, rHandle, b.tick, bVal, lHandle);
                    const tick = a.tick + (b.tick - a.tick) * localT;
                    pts.push(`${toX(tick, width).toFixed(1)},${valueToY(val).toFixed(1)}`);
                }
                result.push({ tick: a.tick, points: pts.join(' ') });
                continue;
            }

            // Semantic preset or linear
            const easingFn = resolveParametricEasing(interp.mode, interp.direction, interp.params);
            for (let s = 0; s <= segSamples; s++) {
                const localT = s / segSamples;
                const easedT = easingFn ? easingFn(localT) : localT;
                const val = aVal + (bVal - aVal) * easedT;
                const tick = a.tick + (b.tick - a.tick) * localT;
                pts.push(`${toX(tick, width).toFixed(1)},${valueToY(val).toFixed(1)}`);
            }
        } else {
            // Legacy easing fallback
            const easeFn = resolveLegacyEasing(a.easingId);
            for (let s = 0; s <= segSamples; s++) {
                const localT = s / segSamples;
                const easedT = channel.interpolation === 'stepped' ? 0 : easeFn(localT);
                const val = aVal + (bVal - aVal) * easedT;
                const tick = a.tick + (b.tick - a.tick) * localT;
                pts.push(`${toX(tick, width).toFixed(1)},${valueToY(val).toFixed(1)}`);
            }
        }

        result.push({ tick: a.tick, points: pts.join(' ') });
    }

    return result;
}

// ─── Bezier handle visual derivation ──────────────────────────────────────────

/** Derive screen-space positions for all visible bezier handles. */
export function buildHandleVisuals(
    keyframes: AutomationChannel['keyframes'],
    toX: (tick: number, width: number) => number,
    width: number,
    valueToY: (val: number) => number,
): HandleVisualData[] {
    const result: HandleVisualData[] = [];

    for (let i = 0; i < keyframes.length; i++) {
        const kf = keyframes[i];
        const val = typeof kf.value === 'number' ? kf.value : 0;
        const kfX = toX(kf.tick, width);
        const kfY = valueToY(val);

        const showRight = i < keyframes.length - 1 && kf.segmentInterpolation?.mode === 'bezier';
        const showLeft = i > 0 && keyframes[i - 1].segmentInterpolation?.mode === 'bezier';

        if (!showLeft && !showRight) continue;

        const leftType = kf.leftHandleType ?? 'auto_clamped';
        const rightType = kf.rightHandleType ?? 'auto_clamped';
        const leftIsAuto = leftType === 'auto' || leftType === 'auto_clamped';
        const rightIsAuto = rightType === 'auto' || rightType === 'auto_clamped';

        const prev = i > 0 ? keyframes[i - 1] : null;
        const next = i < keyframes.length - 1 ? keyframes[i + 1] : null;

        let leftHandle = kf.leftHandle;
        let rightHandle = kf.rightHandle;

        if (showLeft) {
            if (!leftHandle || leftIsAuto) {
                const computed = computeAutoHandles(
                    prev, kf, next, leftType === 'auto' ? 'auto' : 'auto_clamped',
                );
                leftHandle = computed.left;
            } else if (leftType === 'vector' && prev) {
                leftHandle = {
                    dt: (prev.tick - kf.tick) / 3,
                    dv: ((typeof prev.value === 'number' ? prev.value : 0) - val) / 3,
                };
            }
        }

        if (showRight) {
            if (!rightHandle || rightIsAuto) {
                const computed = computeAutoHandles(
                    prev, kf, next, rightType === 'auto' ? 'auto' : 'auto_clamped',
                );
                rightHandle = computed.right;
            } else if (rightType === 'vector' && next) {
                rightHandle = {
                    dt: (next.tick - kf.tick) / 3,
                    dv: ((typeof next.value === 'number' ? next.value : 0) - val) / 3,
                };
            }
        }

        const lh = leftHandle ?? { dt: 0, dv: 0 };
        const rh = rightHandle ?? { dt: 0, dv: 0 };

        result.push({
            tick: kf.tick,
            kfX,
            kfY,
            leftX: toX(kf.tick + lh.dt, width),
            leftY: valueToY(val + lh.dv),
            rightX: toX(kf.tick + rh.dt, width),
            rightY: valueToY(val + rh.dv),
            showLeft,
            showRight,
            leftIsAuto,
            rightIsAuto,
        });
    }

    return result;
}

// ─── Handle drag patch builder ────────────────────────────────────────────────

/**
 * Build the updateKeyframe patch for a handle drag.
 * Applies aligned mirroring (equal-length opposite handle) when origType is 'aligned'.
 */
export function buildHandlePatch(
    dt: number,
    dv: number,
    side: 'left' | 'right',
    origType: HandleType,
    frozenOppLength: number,
): Record<string, unknown> {
    const effectiveType = origType === 'aligned' ? 'aligned' : 'free';
    const patch: Record<string, unknown> =
        side === 'left'
            ? { leftHandle: { dt, dv }, leftHandleType: effectiveType }
            : { rightHandle: { dt, dv }, rightHandleType: effectiveType };

    if (origType === 'aligned') {
        const dist = Math.sqrt(dt * dt + dv * dv);
        if (dist > 0) {
            const scale = frozenOppLength / dist;
            const oppKey = side === 'left' ? 'rightHandle' : 'leftHandle';
            const oppTypeKey = side === 'left' ? 'rightHandleType' : 'leftHandleType';
            patch[oppKey] = { dt: -dt * scale, dv: -dv * scale };
            patch[oppTypeKey] = 'aligned';
        }
    }

    return patch;
}
