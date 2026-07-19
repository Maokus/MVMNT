// @ts-nocheck
// Shared hit-effects and note-animation helpers for piano roll elements.
// Used by vidilike-piano-roll and circular-piano-roll.

import { Arc, BezierPath, Line, Poly, remap, Text, type RenderObject } from '@mvmnt-app/plugin-sdk';

import * as anim from '@mvmnt-app/plugin-sdk/animation';

// ─────────────────────────────────────────────────────────────────────────────
// Animation constants — adjust to change feel without touching logic
// ─────────────────────────────────────────────────────────────────────────────

/** "press" — note holds down while playing, springs back on release. */
const PRESS_ANIM = {
    /** Maximum downward shift as a fraction of noteHeight. */
    maxPressFraction: 0.8,
    /** Duration of the initial press-in phase (seconds). */
    pressInDuration: 0.05,
    /** Easing power for the press-in (higher = snappier). */
    pressEasePower: 1.8,
    /** Easing power for the spring-back (higher = faster snap). */
    springEasePower: 2.5,
};

/** "pluck" — note briefly inflates then returns to normal. */
const PLUCK_ANIM = {
    /** Extra height scale at peak; 0.35 = 35% taller than normal. */
    bounceFactor: 0.35,
};

// ─────────────────────────────────────────────────────────────────────────────
// Ripple default constants
// ─────────────────────────────────────────────────────────────────────────────

/** Defaults for the circle ripple (expanding ring). */
export interface CircleRippleConfig {
    strokeWidth: number;
    startFraction: number;
    endFraction: number;
    fadeFrom: number;
}

/** Defaults for the burst ripple drawn as tapered triangles (vidilike style). */
export interface TriangleBurstRippleConfig {
    minRays: number;
    maxRays: number;
    innerFraction: number;
    outerFraction: number;
    easeOutPower: number;
    baseWidthPx: number;
    angleJitter: number;
    fadeFrom: number;
}

/** Defaults for the burst ripple drawn as simple lines (circular style). */
export interface LineBurstRippleConfig {
    numRays: number;
    innerFraction: number;
    outerFraction: number;
    strokeWidth: number;
    fadeFrom: number;
}

const CIRCLE_RIPPLE_DEFAULTS: CircleRippleConfig = {
    strokeWidth: 2,
    startFraction: 0.1,
    endFraction: 1.0,
    fadeFrom: 0.35,
};

const TRIANGLE_BURST_DEFAULTS: TriangleBurstRippleConfig = {
    minRays: 5,
    maxRays: 11,
    innerFraction: 0.08,
    outerFraction: 1.0,
    easeOutPower: 2.8,
    baseWidthPx: 5,
    angleJitter: 0.55,
    fadeFrom: 0.4,
};

const LINE_BURST_DEFAULTS: LineBurstRippleConfig = {
    numRays: 8,
    innerFraction: 0.12,
    outerFraction: 1.0,
    strokeWidth: 2.5,
    fadeFrom: 0.45,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Return an rgba() string with the given alpha applied to a hex colour. */
export function withAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '').slice(0, 6);
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * Deterministic LCG pseudo-random generator seeded by a note fingerprint.
 * Using a stable seed keeps ray layouts consistent across frames.
 */
export function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = Math.imul(s, 1664525) + 1013904223;
        s = s >>> 0;
        return s / 0xffffffff;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker helpers (centred at cx, cy)
// ─────────────────────────────────────────────────────────────────────────────

export function drawDiamondMarker(
    cx: number,
    cy: number,
    size: number,
    color: string,
    alpha: number,
    scale: number
): RenderObject[] {
    const s = (size / 2) * scale;
    const d = new Poly([cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy], {
        fillColor: withAlpha(color, alpha),
        strokeColor: null,
        strokeWidth: 0,
    });
    d.setLayoutParticipation('exclude');
    return [d];
}

export function drawHeartMarker(
    cx: number,
    cy: number,
    size: number,
    color: string,
    alpha: number,
    scale: number
): RenderObject[] {
    const fontSize = Math.max(10, Math.round(size * scale));
    const t = new Text(cx, cy, '❤', `bold ${fontSize}px sans-serif`, {
        color: withAlpha(color, alpha), align: 'center', baseline: 'middle',
    });
    t.setLayoutParticipation('exclude');
    return [t];
}

export function drawTextMarker(
    cx: number,
    cy: number,
    size: number,
    color: string,
    alpha: number,
    label: string,
    scale: number
): RenderObject[] {
    const fontSize = Math.max(10, Math.round(size * 0.8 * scale));
    const t = new Text(cx, cy, label, `bold ${fontSize}px sans-serif`, {
        color: withAlpha(color, alpha), align: 'center', baseline: 'middle',
    });
    t.setLayoutParticipation('exclude');
    return [t];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripple helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expanding ring ripple.
 * @param config - partial overrides for default constants (e.g. startFraction differs between vidilike and circular).
 */
export function drawCircleRipple(
    cx: number,
    cy: number,
    progress: number,
    rippleRadius: number,
    color: string,
    config?: Partial<CircleRippleConfig>
): RenderObject[] {
    const { strokeWidth, startFraction, endFraction, fadeFrom } = { ...CIRCLE_RIPPLE_DEFAULTS, ...config };
    const alpha = anim.remap(fadeFrom, 1, 1, 0, progress);
    if (alpha <= 0) return [];
    const radius = rippleRadius * (startFraction + (endFraction - startFraction) * anim.easings.easeOutCubic(progress));
    const ring = new Arc(cx, cy, radius, {
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillColor: null,
        strokeColor: withAlpha(color, alpha),
        strokeWidth,
    });
    ring.setLayoutParticipation('exclude');
    return [ring];
}

/**
 * Burst ripple as randomised tapered triangles (vidilike style).
 * Uses a seeded RNG so ray layouts are stable across frames for the same note.
 */
export function drawTriangleBurstRipple(
    cx: number,
    cy: number,
    progress: number,
    rippleRadius: number,
    color: string,
    noteSeed: number,
    config?: Partial<TriangleBurstRippleConfig>
): RenderObject[] {
    const { minRays, maxRays, innerFraction, outerFraction, easeOutPower, baseWidthPx, angleJitter, fadeFrom } = {
        ...TRIANGLE_BURST_DEFAULTS,
        ...config,
    };

    const alpha = anim.remap(fadeFrom, 1, 1, 0, progress);
    if (alpha <= 0) return [];

    const rng = makeRng(noteSeed);
    const numRays = minRays + Math.floor(rng() * (maxRays - minRays + 1));

    // Ease-out: tip extends fast then decelerates
    const eased = 1 - Math.pow(1 - progress, easeOutPower);
    const inner = rippleRadius * innerFraction;
    const outerTip = rippleRadius * (innerFraction + (outerFraction - innerFraction) * eased);
    const halfBase = baseWidthPx / 2;

    const out: RenderObject[] = [];
    for (let i = 0; i < numRays; i++) {
        const baseAngle = (i / numRays) * Math.PI * 2;
        const jitter = (rng() - 0.5) * 2 * angleJitter;
        const angle = baseAngle + jitter;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const px = -sin;
        const py = cos;

        const bx = cx + cos * inner;
        const by = cy + sin * inner;
        const tip = new BezierPath(0, 0, [], {
            fillColor: withAlpha(color, alpha),
            strokeColor: null,
            strokeWidth: 0,
        });
        tip.moveTo(bx + px * halfBase, by + py * halfBase);
        tip.lineTo(bx - px * halfBase, by - py * halfBase);
        tip.lineTo(cx + cos * outerTip, cy + sin * outerTip);
        tip.closePath();
        tip.setLayoutParticipation('exclude');
        out.push(tip);
    }
    return out;
}

/**
 * Burst ripple as simple evenly-spaced lines (circular piano roll style).
 */
export function drawLineBurstRipple(
    cx: number,
    cy: number,
    progress: number,
    rippleRadius: number,
    color: string,
    config?: Partial<LineBurstRippleConfig>
): RenderObject[] {
    const { numRays, innerFraction, outerFraction, strokeWidth, fadeFrom } = { ...LINE_BURST_DEFAULTS, ...config };
    const alpha = anim.remap(fadeFrom, 1, 1, 0, progress);
    if (alpha <= 0) return [];
    const inner = rippleRadius * innerFraction;
    const outer =
        rippleRadius * (innerFraction + (outerFraction - innerFraction) * anim.easings.easeOutCubic(progress));
    const rayColor = withAlpha(color, alpha);
    const out: RenderObject[] = [];
    for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const line = new Line(
            cx + cos * inner,
            cy + sin * inner,
            cx + cos * outer,
            cy + sin * outer,
            { color: rayColor, lineWidth: strokeWidth }
        );
        line.setLayoutParticipation('exclude');
        out.push(line);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Note animation transforms
// Returns { dy, dh } — vertical offset and height delta applied to the note rect.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Press animation: holds the note down for the full playing duration, then springs back.
 * @param timeSinceHit  - seconds elapsed since note start
 * @param noteDuration  - total note duration in seconds
 * @param springDuration - how long the spring-back takes after note ends (seconds)
 * @param noteHeight    - height of the note rect in pixels
 */
export function getPressTransform(
    timeSinceHit: number,
    noteDuration: number,
    springDuration: number,
    noteHeight: number
): { dy: number; dh: number } {
    const maxOffset = noteHeight * PRESS_ANIM.maxPressFraction;

    if (timeSinceHit <= noteDuration) {
        // Press-in phase: quick ease-in to full press, then hold
        const t = anim.clamp(timeSinceHit / PRESS_ANIM.pressInDuration, 0, 1);
        const envelope = Math.pow(t, 1 / PRESS_ANIM.pressEasePower);
        return { dy: maxOffset * envelope, dh: 0 };
    } else {
        // Spring-back phase after note ends
        const t = anim.clamp((timeSinceHit - noteDuration) / springDuration, 0, 1);
        if (t >= 1) return { dy: 0, dh: 0 };
        const envelope = 1 - Math.pow(t, 1 / PRESS_ANIM.springEasePower);
        return { dy: maxOffset * envelope, dh: 0 };
    }
}

/**
 * Pluck animation: note briefly inflates then returns to normal.
 * @param progress - 0..1 over animDuration
 */
export function getPluckTransform(progress: number, noteHeight: number): { dy: number; dh: number } {
    const env = Math.sin(Math.PI * progress);
    const dh = noteHeight * PLUCK_ANIM.bounceFactor * env;
    return { dy: -dh / 2, dh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined hit-effects helper
// ─────────────────────────────────────────────────────────────────────────────

export interface HitEffectsOptions {
    markerType: string;
    markerText: string;
    markerSize: number;
    markerColor: string;
    markerDuration: number;
    rippleType: string;
    rippleRadius: number;
    rippleColor: string;
    rippleDuration: number;
    /**
     * Seed for the triangle burst ripple. If omitted the line burst variant is used.
     * Pass `n.note * 7919 + Math.round(startTime * 100)` for a stable per-note seed.
     */
    noteSeed?: number;
    circleRippleConfig?: Partial<CircleRippleConfig>;
    triangleBurstConfig?: Partial<TriangleBurstRippleConfig>;
    lineBurstConfig?: Partial<LineBurstRippleConfig>;
}

export function pushHitEffects(
    effects: RenderObject[],
    hitX: number,
    hitY: number,
    timeSinceHit: number,
    opts: HitEffectsOptions
): void {
    const {
        markerType,
        markerText,
        markerSize,
        markerColor,
        markerDuration,
        rippleType,
        rippleRadius,
        rippleColor,
        rippleDuration,
        noteSeed,
    } = opts;

    if (markerType !== 'none' && timeSinceHit <= markerDuration) {
        const t = timeSinceHit / markerDuration; // 0..1 over lifetime

        // Scale: ease-out on appear (0→1 in first 30%), ease-in on exit (1→0 in last 70%)
        const APPEAR_FRAC = 0.3;
        let scale: number;
        if (t < APPEAR_FRAC) {
            scale = anim.easings.easeOutBack(t / APPEAR_FRAC);
        } else {
            scale = anim.easings.easeInCubic(1 - (t - APPEAR_FRAC) / (1 - APPEAR_FRAC));
        }
        scale = Math.max(0, scale);

        // Alpha follows scale so there's no ghost at zero size
        const alpha = scale;

        if (markerType === 'diamond') {
            effects.push(...drawDiamondMarker(hitX, hitY, markerSize, markerColor, alpha, scale));
        } else if (markerType === 'heart') {
            effects.push(...drawHeartMarker(hitX, hitY, markerSize, markerColor, alpha, scale));
        } else if (markerType === 'text') {
            effects.push(...drawTextMarker(hitX, hitY, markerSize, markerColor, alpha, markerText, scale));
        }
    }

    if (rippleType !== 'none' && timeSinceHit <= rippleDuration) {
        const rippleProgress = timeSinceHit / rippleDuration;
        if (rippleType === 'burst') {
            if (noteSeed !== undefined) {
                effects.push(
                    ...drawTriangleBurstRipple(
                        hitX,
                        hitY,
                        rippleProgress,
                        rippleRadius,
                        rippleColor,
                        noteSeed,
                        opts.triangleBurstConfig
                    )
                );
            } else {
                effects.push(
                    ...drawLineBurstRipple(hitX, hitY, rippleProgress, rippleRadius, rippleColor, opts.lineBurstConfig)
                );
            }
        } else if (rippleType === 'circle') {
            effects.push(
                ...drawCircleRipple(hitX, hitY, rippleProgress, rippleRadius, rippleColor, opts.circleRippleConfig)
            );
        }
    }
}
