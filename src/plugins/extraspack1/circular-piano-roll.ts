// CircularPianoRoll — notes travel clockwise around a ring and "play" when they reach the trigger point.
// Notes are rendered as arc segments on the ring; pitch can optionally map to hue.
// Hit effects (marker, ripple, arc glow) trigger when a note's start time reaches targetTime.

import {
    SceneElement,
    prop,
    insertElementGroups,
    Rectangle,
    Text,
    Line,
    Arc,
    BezierPath,
    Poly,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Animation / effect constants
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_ANIM = {
    /** Extra stroke-width scale at peak (e.g. 2 = twice as thick). */
    widthScale: 2.5,
};

const BURST_RIPPLE = {
    numRays: 8,
    innerFraction: 0.12,
    outerFraction: 1.0,
    strokeWidth: 2.5,
    fadeFrom: 0.45,
};

const CIRCLE_RIPPLE = {
    strokeWidth: 2,
    startFraction: 0.05,
    endFraction: 1.0,
    fadeFrom: 0.35,
};

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

function withAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '').slice(0, 6);
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Map a MIDI note number to a vibrant hue-based hex colour. */
function pitchToColor(note: number, saturation: number, lightness: number): string {
    const hue = ((note % 12) / 12) * 360;
    return hslToHex(hue, saturation, lightness);
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker helpers
// ─────────────────────────────────────────────────────────────────────────────

function drawDiamondMarker(cx: number, cy: number, size: number, color: string, alpha: number): RenderObject[] {
    const s = size / 2;
    const d = new Poly(
        [cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy],
        withAlpha(color, alpha), null, 0
    );
    (d as any).setIncludeInLayoutBounds?.(false);
    return [d];
}

function drawHeartMarker(cx: number, cy: number, size: number, color: string, alpha: number): RenderObject[] {
    const s = size * 0.55;
    const heart = new BezierPath(cx, cy, [], {
        fillColor: withAlpha(color, alpha),
        strokeColor: null,
        strokeWidth: 0,
    });
    heart.moveTo(0, s * 0.5);
    heart.bezierCurveTo(-s, s, -s * 1.5, -s * 0.5, 0, -s * 0.5);
    heart.bezierCurveTo(s * 1.5, -s * 0.5, s, s, 0, s * 0.5);
    heart.closePath();
    (heart as any).setIncludeInLayoutBounds?.(false);
    return [heart];
}

function drawTextMarker(cx: number, cy: number, size: number, color: string, alpha: number, label: string): RenderObject[] {
    const fontSize = Math.max(10, Math.round(size * 0.8));
    const t = new Text(cx, cy, label, `bold ${fontSize}px sans-serif`, withAlpha(color, alpha), 'center', 'middle');
    (t as any).setIncludeInLayoutBounds?.(false);
    return [t];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripple helpers
// ─────────────────────────────────────────────────────────────────────────────

function drawBurstRipple(cx: number, cy: number, progress: number, rippleRadius: number, color: string): RenderObject[] {
    const { fadeFrom, innerFraction, outerFraction, numRays, strokeWidth } = BURST_RIPPLE;
    const alpha = progress > fadeFrom ? 1 - (progress - fadeFrom) / (1 - fadeFrom + 1e-9) : 1;
    if (alpha <= 0) return [];
    const inner = rippleRadius * innerFraction;
    const outer = rippleRadius * (innerFraction + (outerFraction - innerFraction) * progress);
    const rayColor = withAlpha(color, alpha);
    const out: RenderObject[] = [];
    for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const line = new Line(cx + cos * inner, cy + sin * inner, cx + cos * outer, cy + sin * outer, rayColor, strokeWidth);
        (line as any).setIncludeInLayoutBounds?.(false);
        out.push(line);
    }
    return out;
}

function drawCircleRipple(cx: number, cy: number, progress: number, rippleRadius: number, color: string): RenderObject[] {
    const { fadeFrom, startFraction, endFraction, strokeWidth } = CIRCLE_RIPPLE;
    const alpha = progress > fadeFrom ? 1 - (progress - fadeFrom) / (1 - fadeFrom + 1e-9) : 1;
    if (alpha <= 0) return [];
    const radius = rippleRadius * (startFraction + (endFraction - startFraction) * progress);
    const ring = new Arc(cx, cy, radius, 0, Math.PI * 2, false, {
        fillColor: null,
        strokeColor: withAlpha(color, alpha),
        strokeWidth,
    });
    (ring as any).setIncludeInLayoutBounds?.(false);
    return [ring];
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle helpers
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_ANGLE_MAP: Record<string, number> = {
    top:    -Math.PI / 2,
    right:   0,
    bottom:  Math.PI / 2,
    left:    Math.PI,
};

// ─────────────────────────────────────────────────────────────────────────────
// Element
// ─────────────────────────────────────────────────────────────────────────────

export class CircularPianoRollElement extends SceneElement {
    constructor(id: string = 'circular-piano-roll', config: Record<string, unknown> = {}) {
        super('circular-piano-roll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Circular Piano Roll',
            description: 'Notes travel around a ring and play when they reach the trigger point.',
            category: 'extraspack1',
        }, [
            {
                id: 'midiSource',
                label: 'MIDI Source',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                ],
            },
            {
                id: 'layout',
                label: 'Layout',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.number('ringRadius', 'Ring Radius (px)', 200, { min: 40, max: 1000, step: 5 }),
                    prop.number('ringWidth', 'Ring Width (px)', 20, { min: 4, max: 120, step: 1 }),
                    prop.number('timeWindowBars', 'Time Window (bars)', 2, { min: 1, max: 16, step: 1 }),
                    prop.select('triggerAngle', 'Trigger Position', 'top', [
                        { value: 'top', label: 'Top' },
                        { value: 'right', label: 'Right' },
                        { value: 'bottom', label: 'Bottom' },
                        { value: 'left', label: 'Left' },
                    ]),
                ],
            },
            {
                id: 'notes',
                label: 'Notes',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.select('colorMode', 'Color Mode', 'pitch', [
                        { value: 'pitch', label: 'By Pitch (Hue)' },
                        { value: 'single', label: 'Single Color' },
                    ]),
                    prop.colorAlpha('noteColor', 'Note Color', '#FF6B6BCC', {
                        visibleWhen: [{ key: 'colorMode', equals: 'single' }],
                    }),
                    prop.number('pitchSaturation', 'Hue Saturation (%)', 75, {
                        min: 10, max: 100, step: 1,
                        visibleWhen: [{ key: 'colorMode', equals: 'pitch' }],
                    }),
                    prop.number('pitchLightness', 'Hue Lightness (%)', 60, {
                        min: 20, max: 85, step: 1,
                        visibleWhen: [{ key: 'colorMode', equals: 'pitch' }],
                    }),
                    prop.number('noteOpacity', 'Note Opacity', 0.85, { min: 0.05, max: 1.0, step: 0.01 }),
                ],
            },
            {
                id: 'ring',
                label: 'Ring',
                variant: 'advanced',
                collapsed: true,
                properties: [
                    prop.boolean('showRing', 'Show Background Ring', true),
                    prop.colorAlpha('ringColor', 'Ring Color', '#2A2A3A88', {
                        visibleWhen: [{ key: 'showRing', truthy: true }],
                    }),
                    prop.boolean('showTriggerIndicator', 'Show Trigger Indicator', true),
                    prop.colorAlpha('triggerColor', 'Trigger Color', '#FFFFFFFF', {
                        visibleWhen: [{ key: 'showTriggerIndicator', truthy: true }],
                    }),
                    prop.number('triggerIndicatorLength', 'Trigger Line Length (px)', 30, {
                        min: 5, max: 120, step: 1,
                        visibleWhen: [{ key: 'showTriggerIndicator', truthy: true }],
                    }),
                ],
            },
            {
                id: 'marker',
                label: 'Marker',
                variant: 'basic',
                collapsed: false,
                description: 'Symbol that appears at the trigger point when a note plays.',
                properties: [
                    prop.select('markerType', 'Marker', 'diamond', [
                        { value: 'diamond', label: 'Diamond' },
                        { value: 'heart', label: 'Heart' },
                        { value: 'text', label: 'Text' },
                        { value: 'none', label: 'No Marker' },
                    ]),
                    prop.string('markerText', 'Marker Text', '♪', {
                        visibleWhen: [{ key: 'markerType', equals: 'text' }],
                    }),
                    prop.number('markerSize', 'Marker Size (px)', 22, { min: 8, max: 80, step: 1 }),
                    prop.color('markerColor', 'Marker Color', '#FFFFFF'),
                    prop.number('markerDuration', 'Marker Duration (s)', 0.4, { min: 0.05, max: 3, step: 0.05 }),
                ],
            },
            {
                id: 'ripple',
                label: 'Ripple',
                variant: 'basic',
                collapsed: false,
                description: 'Effect that radiates from the trigger point when a note plays.',
                properties: [
                    prop.select('rippleType', 'Ripple', 'burst', [
                        { value: 'burst', label: 'Burst' },
                        { value: 'circle', label: 'Circle' },
                        { value: 'none', label: 'No Ripple' },
                    ]),
                    prop.number('rippleRadius', 'Ripple Radius (px)', 50, {
                        min: 10, max: 300, step: 1,
                        visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                    }),
                    prop.color('rippleColor', 'Ripple Color', '#FFFFFF', {
                        visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                    }),
                    prop.number('rippleDuration', 'Ripple Duration (s)', 0.5, {
                        min: 0.05, max: 3, step: 0.05,
                        visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                    }),
                ],
            },
            {
                id: 'animation',
                label: 'Animation',
                variant: 'basic',
                collapsed: false,
                description: 'Pulse applied to the note arc as it crosses the trigger point.',
                properties: [
                    prop.boolean('pulseOnHit', 'Pulse Note on Hit', true),
                    prop.number('animationDuration', 'Pulse Duration (s)', 0.25, {
                        min: 0.05, max: 2, step: 0.05,
                        visibleWhen: [{ key: 'pulseOnHit', truthy: true }],
                    }),
                ],
            },
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const objects: RenderObject[] = [];

        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        if (!api || status !== 'ok') {
            objects.push(new Text(0, 0, 'Timeline API unavailable', '12px sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }
        if (!p.midiTrackId) {
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px sans-serif', '#94a3b8', 'left', 'top'));
            return objects;
        }

        // ── Config ──────────────────────────────────────────────────────────
        const timelineState = api.timeline.getStateSnapshot();
        const bpm = timelineState?.timeline.globalBpm ?? 120;
        const beatsPerBar = timelineState?.timeline.beatsPerBar ?? 4;
        const timeWindowBars = Math.max(1, Math.round((p.timeWindowBars as number) ?? 2));
        const timeWindowDuration = timeWindowBars * beatsPerBar * (60 / bpm);

        const ringRadius = Math.max(40, (p.ringRadius as number) ?? 200);
        const ringWidth = Math.max(4, (p.ringWidth as number) ?? 20);
        const triggerAngle = TRIGGER_ANGLE_MAP[(p.triggerAngle as string) ?? 'top'] ?? TRIGGER_ANGLE_MAP.top;

        const colorMode = (p.colorMode as string) ?? 'pitch';
        const noteColor = (p.noteColor as string) ?? '#FF6B6BCC';
        const pitchSaturation = Math.max(10, Math.min(100, (p.pitchSaturation as number) ?? 75));
        const pitchLightness = Math.max(20, Math.min(85, (p.pitchLightness as number) ?? 60));
        const noteOpacity = Math.max(0.05, Math.min(1, (p.noteOpacity as number) ?? 0.85));

        const showRing = (p.showRing as boolean) ?? true;
        const ringColor = (p.ringColor as string) ?? '#2A2A3A88';
        const showTriggerIndicator = (p.showTriggerIndicator as boolean) ?? true;
        const triggerColor = (p.triggerColor as string) ?? '#FFFFFFFF';
        const triggerIndicatorLength = Math.max(5, (p.triggerIndicatorLength as number) ?? 30);

        const markerType = (p.markerType as string) ?? 'diamond';
        const markerText = String(p.markerText ?? '♪');
        const markerSize = Math.max(8, (p.markerSize as number) ?? 22);
        const markerColor = (p.markerColor as string) ?? '#FFFFFF';
        const markerDuration = Math.max(0.05, (p.markerDuration as number) ?? 0.4);

        const rippleType = (p.rippleType as string) ?? 'burst';
        const rippleRadius = Math.max(10, (p.rippleRadius as number) ?? 50);
        const rippleColor = (p.rippleColor as string) ?? '#FFFFFF';
        const rippleDuration = Math.max(0.05, (p.rippleDuration as number) ?? 0.5);

        const pulseOnHit = (p.pulseOnHit as boolean) ?? true;
        const animDuration = Math.max(0.05, (p.animationDuration as number) ?? 0.25);

        // Centre of the ring in element-local coords
        const cx = 0;
        const cy = 0;

        // ── Layout sentinel (bounding box for the ring) ──────────────────────
        {
            const d = ringRadius + ringWidth / 2;
            const layout = new Rectangle(-d, -d, d * 2, d * 2, null, null, 0);
            (layout as any).setIncludeInLayoutBounds?.(true);
            objects.push(layout);
        }

        // ── Background ring ──────────────────────────────────────────────────
        if (showRing) {
            const bg = new Arc(cx, cy, ringRadius, 0, Math.PI * 2, false, {
                fillColor: null,
                strokeColor: ringColor,
                strokeWidth: ringWidth,
            });
            (bg as any).setIncludeInLayoutBounds?.(false);
            objects.push(bg);
        }

        // ── Query notes ──────────────────────────────────────────────────────
        // We need notes that are currently visible on the ring (ahead in time)
        // plus notes that just crossed the trigger (behind in time, for effects).
        const maxEffectDuration = Math.max(markerDuration, rippleDuration, pulseOnHit ? animDuration : 0);
        const queryStart = targetTime - maxEffectDuration;
        const queryEnd = targetTime + timeWindowDuration;

        const notes = api.timeline.selectNotesInWindow({
            trackIds: [p.midiTrackId as string],
            startSec: queryStart,
            endSec: queryEnd,
        });

        // ── Convert time offset to arc angle ─────────────────────────────────
        // Positive timeOffset = future = clockwise from trigger.
        // Full circle (2π) = timeWindowDuration seconds.
        const timeToAngle = (t: number) =>
            triggerAngle + ((t - targetTime) / timeWindowDuration) * Math.PI * 2;

        // ── Trigger point coordinates (on the ring surface) ──────────────────
        const triggerX = cx + ringRadius * Math.cos(triggerAngle);
        const triggerY = cy + ringRadius * Math.sin(triggerAngle);

        // ── Render notes and effects ─────────────────────────────────────────
        const effects: RenderObject[] = [];

        for (const n of notes) {
            const startTime = n.startTime;
            const endTime = n.endTime ?? (startTime + 0.25);
            const timeSinceHit = targetTime - startTime;

            // Determine note colour
            let baseColor: string;
            if (colorMode === 'pitch') {
                baseColor = pitchToColor(n.note, pitchSaturation, pitchLightness);
            } else {
                // Strip alpha from colorAlpha prop, apply noteOpacity separately
                baseColor = noteColor.slice(0, 7);
            }
            const noteStrokeColor = withAlpha(baseColor, noteOpacity);

            // ── Note arc on ring ─────────────────────────────────────────────
            const angleStart = timeToAngle(startTime);
            const angleEnd = timeToAngle(endTime);

            // Only draw the arc if it has any angular extent and is (partially) visible.
            // "Visible" = any part of the arc is in [triggerAngle, triggerAngle + 2π]
            // We draw all notes in the query window; clip by checking angular overlap.
            if (angleEnd > angleStart) {
                const visibleStart = triggerAngle - Math.PI * 2; // behind trigger (just-hit notes)
                const visibleEnd = triggerAngle + Math.PI * 2;   // one full revolution ahead

                const clampedStart = Math.max(angleStart, visibleStart);
                const clampedEnd = Math.min(angleEnd, visibleEnd);

                if (clampedEnd > clampedStart) {
                    // Apply pulse: widen stroke width when hitting the trigger
                    let arcStrokeWidth = ringWidth;
                    if (pulseOnHit && timeSinceHit >= 0 && timeSinceHit <= animDuration) {
                        const progress = timeSinceHit / animDuration;
                        const env = Math.sin(Math.PI * progress);
                        arcStrokeWidth = ringWidth * (1 + (PULSE_ANIM.widthScale - 1) * env);
                    }

                    const arc = new Arc(cx, cy, ringRadius, clampedStart, clampedEnd, false, {
                        fillColor: null,
                        strokeColor: noteStrokeColor,
                        strokeWidth: arcStrokeWidth,
                    });
                    (arc as any).setIncludeInLayoutBounds?.(false);
                    objects.push(arc);
                }
            }

            // ── Hit effects ──────────────────────────────────────────────────
            if (timeSinceHit >= 0) {
                if (markerType !== 'none' && timeSinceHit <= markerDuration) {
                    const alpha = 1 - timeSinceHit / markerDuration;
                    if (markerType === 'diamond') {
                        effects.push(...drawDiamondMarker(triggerX, triggerY, markerSize, markerColor, alpha));
                    } else if (markerType === 'heart') {
                        effects.push(...drawHeartMarker(triggerX, triggerY, markerSize, markerColor, alpha));
                    } else if (markerType === 'text') {
                        effects.push(...drawTextMarker(triggerX, triggerY, markerSize, markerColor, alpha, markerText));
                    }
                }

                if (rippleType !== 'none' && timeSinceHit <= rippleDuration) {
                    const rippleProgress = timeSinceHit / rippleDuration;
                    if (rippleType === 'burst') {
                        effects.push(...drawBurstRipple(triggerX, triggerY, rippleProgress, rippleRadius, rippleColor));
                    } else if (rippleType === 'circle') {
                        effects.push(...drawCircleRipple(triggerX, triggerY, rippleProgress, rippleRadius, rippleColor));
                    }
                }
            }
        }

        objects.push(...effects);

        // ── Trigger indicator ─────────────────────────────────────────────────
        // A short line extending outward from the ring at the trigger angle.
        if (showTriggerIndicator) {
            const cos = Math.cos(triggerAngle);
            const sin = Math.sin(triggerAngle);
            const innerR = ringRadius - ringWidth / 2 - 4;
            const outerR = ringRadius + ringWidth / 2 + triggerIndicatorLength;
            const ind = new Line(
                cx + cos * innerR, cy + sin * innerR,
                cx + cos * outerR, cy + sin * outerR,
                triggerColor, 2
            );
            (ind as any).setIncludeInLayoutBounds?.(false);
            objects.push(ind);
        }

        return objects;
    }
}
