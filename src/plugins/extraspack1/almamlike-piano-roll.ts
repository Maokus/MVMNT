// AlmamlikePianoRoll — notes scroll right-to-left past a static playhead.
// When a note's head crosses the playhead a marker, ripple, and/or animation trigger.
// All tuning constants are grouped at the top for easy developer tweaking.

import {
    SceneElement,
    prop,
    insertElementGroups,
    Rectangle,
    Text,
    Line,
    Poly,
    BezierPath,
    Arc,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Developer-tweakable animation constants
// Adjust these to change the feel of each effect without touching the logic.
// ─────────────────────────────────────────────────────────────────────────────

/** "press" — note squishes vertically when it crosses the playhead. */
const PRESS_ANIM = {
    /** 0 = no squish, 1 = completely flat at peak. */
    squishFactor: 0.40,
    /** Envelope: sin(π · progress), so squish peaks at progress ≈ 0.5 by default.
     *  A lower peakAt shifts the peak earlier; unused here because sin already centres. */
    _note: 'squish = squishFactor * sin(π * progress)',
};

/** "pluck" — note briefly inflates then returns to normal. */
const PLUCK_ANIM = {
    /** Extra height scale at peak; 0.35 = 35% taller than normal. */
    bounceFactor: 0.35,
    _note: 'bounce = bounceFactor * sin(π * progress)',
};

/** "burst" ripple — radiating line rays from the hit point. */
const BURST_RIPPLE = {
    /** Number of radiating rays. */
    numRays: 8,
    /** Inner gap at origin (fraction of rippleRadius). */
    innerFraction: 0.15,
    /** Outer tip at full extension (fraction of rippleRadius at progress=1). */
    outerFraction: 1.0,
    /** Stroke width of each ray in px. */
    strokeWidth: 2.5,
    /** Progress at which rays begin to fade out (0..1). */
    fadeFrom: 0.45,
};

/** "circle" ripple — expanding ring from the hit point. */
const CIRCLE_RIPPLE = {
    /** Ring stroke width in px. */
    strokeWidth: 2,
    /** Starting radius as a fraction of rippleRadius at progress=0. */
    startFraction: 0.1,
    /** Ending radius as a fraction of rippleRadius at progress=1. */
    endFraction: 1.0,
    /** Progress at which the ring starts to fade out (0..1). */
    fadeFrom: 0.35,
};

// ─────────────────────────────────────────────────────────────────────────────
// Colour utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Return an rgba() colour string with the given alpha applied to a hex colour. */
function withAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '').slice(0, 6);
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker drawing helpers  (centred at cx, cy)
// ─────────────────────────────────────────────────────────────────────────────

function drawDiamondMarker(cx: number, cy: number, size: number, color: string, alpha: number): RenderObject[] {
    const s = size / 2;
    const diamond = new Poly(
        [cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy],
        withAlpha(color, alpha),
        null,
        0
    );
    (diamond as any).setIncludeInLayoutBounds?.(false);
    return [diamond];
}

function drawHeartMarker(cx: number, cy: number, size: number, color: string, alpha: number): RenderObject[] {
    // Two-cubic bezier heart centred at (cx, cy).
    // Increasing `s` makes the heart bigger; the formula uses a classic two-stroke shape.
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
    const t = new Text(
        cx, cy,
        label,
        `bold ${fontSize}px sans-serif`,
        withAlpha(color, alpha),
        'center',
        'middle'
    );
    (t as any).setIncludeInLayoutBounds?.(false);
    return [t];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripple drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

function drawBurstRipple(
    cx: number, cy: number,
    progress: number,
    rippleRadius: number,
    color: string
): RenderObject[] {
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
        const line = new Line(
            cx + cos * inner, cy + sin * inner,
            cx + cos * outer, cy + sin * outer,
            rayColor,
            strokeWidth
        );
        (line as any).setIncludeInLayoutBounds?.(false);
        out.push(line);
    }
    return out;
}

function drawCircleRipple(
    cx: number, cy: number,
    progress: number,
    rippleRadius: number,
    color: string
): RenderObject[] {
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
// Note animation transform helpers
// Returns { dy, dh } — vertical offset and height delta applied to the note rect.
// ─────────────────────────────────────────────────────────────────────────────

function getPressTransform(progress: number, noteHeight: number): { dy: number; dh: number } {
    const env = Math.sin(Math.PI * progress);
    const dh = -noteHeight * PRESS_ANIM.squishFactor * env;
    return { dy: -dh / 2, dh };
}

function getPluckTransform(progress: number, noteHeight: number): { dy: number; dh: number } {
    const env = Math.sin(Math.PI * progress);
    const dh = noteHeight * PLUCK_ANIM.bounceFactor * env;
    return { dy: -dh / 2, dh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Element
// ─────────────────────────────────────────────────────────────────────────────

export class AlmamlikePianoRollElement extends SceneElement {
    constructor(id: string = 'almamlike-piano-roll', config: Record<string, unknown> = {}) {
        super('almamlike-piano-roll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Almamlike Piano Roll',
            description: 'Notes scroll right-to-left; markers and ripples trigger when a note crosses the playhead.',
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
                label: 'Layout & Range',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.number('rollWidth', 'Roll Width (px)', 800, { min: 100, max: 4000, step: 10 }),
                    prop.number('timeUnitBars', 'Time Window (bars)', 2, { min: 1, max: 8, step: 1 }),
                    prop.number('minNote', 'Min MIDI Note', 30, { min: 0, max: 127, step: 1 }),
                    prop.number('maxNote', 'Max MIDI Note', 72, { min: 0, max: 127, step: 1 }),
                    prop.number('noteHeight', 'Note Height (px)', 12, { min: 4, max: 60, step: 1 }),
                    prop.number('playheadPosition', 'Playhead Position (0–1)', 0.25, { min: 0, max: 1, step: 0.01 }),
                ],
            },
            {
                id: 'notes',
                label: 'Notes',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.colorAlpha('noteColor', 'Note Color', '#FF6B6BCC'),
                    prop.number('noteCornerRadius', 'Corner Radius (px)', 2, { min: 0, max: 20, step: 1 }),
                ],
            },
            {
                id: 'playhead',
                label: 'Playhead',
                variant: 'advanced',
                collapsed: true,
                properties: [
                    prop.boolean('showPlayhead', 'Show Playhead', true),
                    prop.colorAlpha('playheadColor', 'Playhead Color', '#FF6B6BFF', {
                        visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                    }),
                    prop.number('playheadLineWidth', 'Playhead Width (px)', 2, {
                        min: 1, max: 10, step: 1,
                        visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                    }),
                ],
            },
            {
                id: 'marker',
                label: 'Marker',
                variant: 'basic',
                collapsed: false,
                description: 'Symbol that appears at the playhead when a note is hit.',
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
                    prop.number('markerSize', 'Marker Size (px)', 20, { min: 8, max: 80, step: 1 }),
                    prop.color('markerColor', 'Marker Color', '#FFFFFF'),
                    prop.number('markerDuration', 'Marker Duration (s)', 0.5, { min: 0.05, max: 3, step: 0.05 }),
                ],
            },
            {
                id: 'ripple',
                label: 'Ripple',
                variant: 'basic',
                collapsed: false,
                description: 'Effect that emanates from the playhead when a note is hit.',
                properties: [
                    prop.select('rippleType', 'Ripple', 'burst', [
                        { value: 'burst', label: 'Burst' },
                        { value: 'circle', label: 'Circle' },
                        { value: 'none', label: 'No Ripple' },
                    ]),
                    prop.number('rippleRadius', 'Ripple Radius (px)', 40, {
                        min: 10, max: 200, step: 1,
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
                description: 'Animation played on the note itself when it crosses the playhead.',
                properties: [
                    prop.select('animationType', 'Animation', 'press', [
                        { value: 'press', label: 'Press' },
                        { value: 'pluck', label: 'Pluck' },
                        { value: 'none', label: 'No Animation' },
                    ]),
                    prop.number('animationDuration', 'Animation Duration (s)', 0.3, {
                        min: 0.05, max: 2, step: 0.05,
                        visibleWhen: [{ key: 'animationType', notEquals: 'none' }],
                    }),
                ],
            },
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const objects: RenderObject[] = [];

        // ── Timeline API ────────────────────────────────────────────────────
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        if (!api || status !== 'ok') {
            objects.push(new Text(0, 0, 'Timeline API unavailable', '12px sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }
        if (!p.midiTrackId) {
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px sans-serif', '#94a3b8', 'left', 'top'));
            return objects;
        }

        // ── Config values ───────────────────────────────────────────────────
        const timelineState = api.timeline.getStateSnapshot();
        const bpm = timelineState?.timeline.globalBpm ?? 120;
        const beatsPerBar = timelineState?.timeline.beatsPerBar ?? 4;
        const timeUnitBars = Math.max(1, Math.round((p.timeUnitBars as number) ?? 2));
        const timeUnitDuration = timeUnitBars * beatsPerBar * (60 / bpm);

        const rollWidth = Math.max(100, (p.rollWidth as number) ?? 800);
        const minNote = Math.max(0, Math.min(127, Math.floor((p.minNote as number) ?? 30)));
        const maxNote = Math.max(0, Math.min(127, Math.floor((p.maxNote as number) ?? 72)));
        const noteHeight = Math.max(4, (p.noteHeight as number) ?? 12);
        const totalNotes = maxNote - minNote + 1;

        const playheadPosition = Math.max(0, Math.min(1, (p.playheadPosition as number) ?? 0.25));
        const playheadX = rollWidth * playheadPosition;

        const noteColor = (p.noteColor as string) ?? '#FF6B6BCC';
        const noteCornerRadius = Math.max(0, (p.noteCornerRadius as number) ?? 2);

        const showPlayhead = (p.showPlayhead as boolean) ?? true;
        const playheadColor = (p.playheadColor as string) ?? '#FF6B6BFF';
        const playheadLineWidth = Math.max(1, (p.playheadLineWidth as number) ?? 2);

        const markerType = (p.markerType as string) ?? 'diamond';
        const markerText = String(p.markerText ?? '♪');
        const markerSize = Math.max(8, (p.markerSize as number) ?? 20);
        const markerColor = (p.markerColor as string) ?? '#FFFFFF';
        const markerDuration = Math.max(0.05, (p.markerDuration as number) ?? 0.5);

        const rippleType = (p.rippleType as string) ?? 'burst';
        const rippleRadius = Math.max(10, (p.rippleRadius as number) ?? 40);
        const rippleColor = (p.rippleColor as string) ?? '#FFFFFF';
        const rippleDuration = Math.max(0.05, (p.rippleDuration as number) ?? 0.5);

        const animType = (p.animationType as string) ?? 'press';
        const animDuration = Math.max(0.05, (p.animationDuration as number) ?? 0.3);

        // ── Query window ────────────────────────────────────────────────────
        // Extend backwards by the longest effect duration so in-progress effects
        // on notes whose bodies have already scrolled past still render correctly.
        const maxEffectDuration = Math.max(markerDuration, rippleDuration, animDuration);
        const windowStart = targetTime - playheadPosition * timeUnitDuration;
        const windowEnd = targetTime + (1 - playheadPosition) * timeUnitDuration;
        const queryStart = windowStart - maxEffectDuration;

        const notes = api.timeline.selectNotesInWindow({
            trackIds: [p.midiTrackId as string],
            startSec: queryStart,
            endSec: windowEnd,
        });

        // Helpers to convert time/pitch to screen coords
        const xFromTime = (t: number) =>
            playheadX + ((t - targetTime) / timeUnitDuration) * rollWidth;
        const yFromNote = (note: number) => (maxNote - note) * noteHeight;

        // ── Layout bounds sentinel ──────────────────────────────────────────
        {
            const totalHeight = totalNotes * noteHeight;
            const layout = new Rectangle(0, 0, rollWidth, totalHeight, null, null, 0);
            (layout as any).setIncludeInLayoutBounds?.(true);
            objects.push(layout);
        }

        // ── Collect per-note render objects ─────────────────────────────────
        const effects: RenderObject[] = []; // rendered after notes so they sit on top

        for (const n of notes) {
            const noteIdx = n.note - minNote;
            if (noteIdx < 0 || noteIdx >= totalNotes) continue;

            const startTime = n.startTime;
            const endTime = n.endTime ?? (startTime + 0.25);
            const timeSinceHit = targetTime - startTime; // positive = note has been hit

            // ── Note body ────────────────────────────────────────────────────
            // xStart = leading edge (earlier time), xEnd = trailing edge (later time)
            const xNoteStart = xFromTime(startTime);
            const xNoteEnd = xFromTime(endTime);

            const drawLeft = Math.max(0, xNoteStart);
            const drawRight = Math.min(rollWidth, xNoteEnd);

            if (drawRight > 0 && drawLeft < rollWidth && drawRight > drawLeft) {
                let rectY = yFromNote(n.note);
                let rectH = noteHeight;

                // Apply note-body animation when the note has just been hit
                if (animType !== 'none' && timeSinceHit >= 0 && timeSinceHit <= animDuration) {
                    const progress = timeSinceHit / animDuration;
                    const transform =
                        animType === 'press' ? getPressTransform(progress, noteHeight) :
                        animType === 'pluck' ? getPluckTransform(progress, noteHeight) :
                        null;
                    if (transform) {
                        rectY += transform.dy;
                        rectH = Math.max(1, rectH + transform.dh);
                    }
                }

                const rect = new Rectangle(drawLeft, rectY, drawRight - drawLeft, rectH, noteColor);
                if (noteCornerRadius > 0) (rect as any).setCornerRadius?.(noteCornerRadius);
                (rect as any).setIncludeInLayoutBounds?.(false);
                objects.push(rect);
            }

            // ── Hit effects (marker + ripple) ────────────────────────────────
            // Only trigger when the note has been hit (timeSinceHit >= 0)
            if (timeSinceHit >= 0) {
                const effectCx = playheadX;
                const effectCy = yFromNote(n.note) + noteHeight / 2;

                // Marker
                if (markerType !== 'none' && timeSinceHit <= markerDuration) {
                    const markerProgress = timeSinceHit / markerDuration;
                    const alpha = 1 - markerProgress; // fade out linearly

                    if (markerType === 'diamond') {
                        effects.push(...drawDiamondMarker(effectCx, effectCy, markerSize, markerColor, alpha));
                    } else if (markerType === 'heart') {
                        effects.push(...drawHeartMarker(effectCx, effectCy, markerSize, markerColor, alpha));
                    } else if (markerType === 'text') {
                        effects.push(...drawTextMarker(effectCx, effectCy, markerSize, markerColor, alpha, markerText));
                    }
                }

                // Ripple
                if (rippleType !== 'none' && timeSinceHit <= rippleDuration) {
                    const rippleProgress = timeSinceHit / rippleDuration;

                    if (rippleType === 'burst') {
                        effects.push(...drawBurstRipple(effectCx, effectCy, rippleProgress, rippleRadius, rippleColor));
                    } else if (rippleType === 'circle') {
                        effects.push(...drawCircleRipple(effectCx, effectCy, rippleProgress, rippleRadius, rippleColor));
                    }
                }
            }
        }

        objects.push(...effects);

        // ── Playhead line ───────────────────────────────────────────────────
        if (showPlayhead) {
            const totalHeight = totalNotes * noteHeight;
            const ph = new Line(playheadX, 0, playheadX, totalHeight, playheadColor, playheadLineWidth);
            (ph as any).setIncludeInLayoutBounds?.(false);
            objects.push(ph);
        }

        return objects;
    }
}
