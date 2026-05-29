// CircularPianoRoll — notes travel clockwise around a ring and "play" when they reach the trigger point.
// Notes are rendered as arc segments on the ring; pitch can optionally map to hue.
// Hit effects (marker, ripple, arc glow) trigger when a note's start time reaches targetTime.

import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    Rectangle,
    Text,
    Line,
    Arc,
    GlowLayer,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';
import { withAlpha, pushHitEffects } from './piano-roll-effects';

// ─────────────────────────────────────────────────────────────────────────────
// Animation / effect constants
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_ANIM = {
    /** Extra stroke-width scale at peak (e.g. 2 = twice as thick). */
    widthScale: 2.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (x: number) =>
        Math.round(x * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Map a MIDI note number to a vibrant hue-based hex colour. */
function pitchToColor(note: number, saturation: number, lightness: number): string {
    const hue = ((note % 12) / 12) * 360;
    return hslToHex(hue, saturation, lightness);
}

// ─────────────────────────────────────────────────────────────────────────────
// Polar-mode background grid helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Draw faint concentric lane separators for the polar piano roll. */
function drawPolarGrid(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    minNote: number,
    maxNote: number,
    color: string,
    arcStart: number,
    arcEnd: number,
    objects: RenderObject[]
): void {
    const totalNotes = maxNote - minNote + 1;
    const laneHeight = (outerRadius - innerRadius) / totalNotes;
    for (let i = 0; i <= totalNotes; i++) {
        const r = innerRadius + i * laneHeight;
        const separator = new Arc(cx, cy, r, arcStart, arcEnd, false, {
            fillColor: null,
            strokeColor: color,
            strokeWidth: 0.5,
        });
        separator.setLayoutParticipation('exclude');
        objects.push(separator);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert clock-degrees (0 = top, clockwise) to standard math radians. */
const clockDegToRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

// ─────────────────────────────────────────────────────────────────────────────
// Element
// ─────────────────────────────────────────────────────────────────────────────

export class CircularPianoRollElement extends SceneElement {
    constructor(id: string = 'circular-piano-roll', config: Record<string, unknown> = {}) {
        super('circular-piano-roll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Circular Piano Roll',
                description: 'Notes travel around a ring and play when they reach the trigger point.',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [prop.midiTrack('midiTrackId', 'MIDI Track')],
                    },
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.select('ringMode', 'Mode', 'polar', [
                                { value: 'ring', label: 'Ring (all notes share one ring)' },
                                { value: 'polar', label: 'Polar (pitch = radius, like a piano roll)' },
                            ]),
                            prop.number('ringRadius', 'Outer Radius (px)', 400, { step: 5 }),
                            prop.number('ringWidth', 'Ring Width (px)', 20, {
                                step: 1,
                                visibleWhen: [{ key: 'ringMode', equals: 'ring' }],
                            }),
                            prop.number('innerRadius', 'Inner Radius (px)', 60, {
                                step: 5,
                                visibleWhen: [{ key: 'ringMode', equals: 'polar' }],
                            }),
                            prop.number('minNote', 'Min MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Lowest note shown. Set to -1 to auto-detect from the track.',
                                visibleWhen: [{ key: 'ringMode', equals: 'polar' }],
                            }),
                            prop.number('maxNote', 'Max MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Highest note shown. Set to -1 to auto-detect from the track.',
                                visibleWhen: [{ key: 'ringMode', equals: 'polar' }],
                            }),
                            prop.number('polarNoteHeight', 'Note Lane Height (px)', 8, {
                                step: 1,
                                visibleWhen: [{ key: 'ringMode', equals: 'polar' }],
                            }),
                            prop.number('timeWindowBars', 'Time Window (bars)', 2, { min: 1, max: 16, step: 1 }),
                            prop.number('startAngle', 'Start Angle (°)', 0, { min: 0, max: 360, step: 1 }),
                            prop.number('endAngle', 'End Angle (°)', 360, { min: 0, max: 360, step: 1 }),
                            prop.number('playheadPosition', 'Playhead Position', 0.5, { min: 0, max: 1, step: 0.01 }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'notes',
                        label: 'Notes',
                        collapsed: false,
                        properties: [
                            prop.select('colorMode', 'Color Mode', 'single', [
                                { value: 'pitch', label: 'By Pitch (Hue)' },
                                { value: 'single', label: 'Single Color' },
                            ]),
                            prop.colorAlpha('noteColor', 'Note Color', '#FF6B6BCC', {
                                visibleWhen: [{ key: 'colorMode', equals: 'single' }],
                            }),
                            prop.number('pitchSaturation', 'Hue Saturation (%)', 75, {
                                min: 10,
                                max: 100,
                                step: 1,
                                visibleWhen: [{ key: 'colorMode', equals: 'pitch' }],
                            }),
                            prop.number('pitchLightness', 'Hue Lightness (%)', 60, {
                                min: 20,
                                max: 85,
                                step: 1,
                                visibleWhen: [{ key: 'colorMode', equals: 'pitch' }],
                            }),
                            prop.number('noteOpacity', 'Note Opacity', 0.85, { min: 0.05, max: 1.0, step: 0.01 }),
                        ],
                    },
                    {
                        id: 'ring',
                        label: 'Ring',
                        collapsed: true,
                        properties: [
                            prop.boolean('showRing', 'Show Background Ring', false),
                            prop.colorAlpha('ringColor', 'Ring Color', '#2A2A3A88', {
                                visibleWhen: [{ key: 'showRing', truthy: true }],
                            }),
                            prop.boolean('showPolarGrid', 'Show Pitch Grid Lines', false, {
                                visibleWhen: [{ key: 'ringMode', equals: 'polar' }],
                            }),
                            prop.colorAlpha('polarGridColor', 'Grid Line Color', '#FFFFFF18', {
                                visibleWhen: [
                                    { key: 'ringMode', equals: 'polar' },
                                    { key: 'showPolarGrid', truthy: true },
                                ],
                            }),
                            prop.boolean('showTriggerIndicator', 'Show Trigger Indicator', false),
                            prop.colorAlpha('triggerColor', 'Trigger Color', '#FFFFFFFF', {
                                visibleWhen: [{ key: 'showTriggerIndicator', truthy: true }],
                            }),
                            prop.number('triggerIndicatorLength', 'Trigger Line Length (px)', 30, {
                                step: 1,
                                visibleWhen: [
                                    { key: 'showTriggerIndicator', truthy: true },
                                    { key: 'ringMode', equals: 'ring' },
                                ],
                            }),
                        ],
                    },
                    {
                        id: 'marker',
                        label: 'Marker',
                        collapsed: false,
                        description: 'Symbol that appears at the trigger point when a note plays.',
                        properties: [
                            prop.select('markerType', 'Marker', 'none', [
                                { value: 'diamond', label: 'Diamond' },
                                { value: 'heart', label: 'Heart' },
                                { value: 'text', label: 'Text' },
                                { value: 'none', label: 'No Marker' },
                            ]),
                            prop.string('markerText', 'Marker Text', '♪', {
                                visibleWhen: [{ key: 'markerType', equals: 'text' }],
                            }),
                            prop.number('markerSize', 'Marker Size (px)', 22, { step: 1 }),
                            prop.color('markerColor', 'Marker Color', '#FFFFFF'),
                            prop.number('markerDuration', 'Marker Duration (s)', 0.4, {
                                min: 0.05,
                                max: 3,
                                step: 0.05,
                            }),
                        ],
                    },
                    {
                        id: 'ripple',
                        label: 'Ripple',
                        collapsed: false,
                        description: 'Effect that radiates from the trigger point when a note plays.',
                        properties: [
                            prop.select('rippleType', 'Ripple', 'none', [
                                { value: 'burst', label: 'Burst' },
                                { value: 'circle', label: 'Circle' },
                                { value: 'none', label: 'No Ripple' },
                            ]),
                            prop.number('rippleRadius', 'Ripple Radius (px)', 50, {
                                step: 1,
                                visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                            }),
                            prop.color('rippleColor', 'Ripple Color', '#FFFFFF', {
                                visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                            }),
                            prop.number('rippleDuration', 'Ripple Duration (s)', 0.5, {
                                min: 0.05,
                                max: 3,
                                step: 0.05,
                                visibleWhen: [{ key: 'rippleType', notEquals: 'none' }],
                            }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        description: 'Pulse applied to the note arc as it crosses the trigger point.',
                        properties: [
                            prop.boolean('pulseOnHit', 'Pulse Note on Hit', true),
                            prop.number('animationDuration', 'Pulse Duration (s)', 0.25, {
                                min: 0.05,
                                max: 2,
                                step: 0.05,
                                visibleWhen: [{ key: 'pulseOnHit', truthy: true }],
                            }),
                            prop.number('bloomRadius', 'Bloom', 0, { step: 1 }),
                        ],
                    },
                ]),
            ]
        );
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

        const ringMode = (p.ringMode as string) ?? 'ring';
        const ringRadius = Math.max(40, (p.ringRadius as number) ?? 200);
        const ringWidth = Math.max(4, (p.ringWidth as number) ?? 20);
        const innerRadius = Math.max(10, Math.min(ringRadius - 10, (p.innerRadius as number) ?? 60));

        // Auto-detect min/max from midiCache when set to -1
        const rawMinNote = Math.floor((p.minNote as number) ?? -1);
        const rawMaxNote = Math.floor((p.maxNote as number) ?? -1);
        let minNote: number;
        let maxNote: number;
        if (rawMinNote === -1 || rawMaxNote === -1) {
            const trackId = p.midiTrackId as string | undefined;
            let autoMinNote = 21;
            let autoMaxNote = 108;
            if (trackId && timelineState) {
                const track = timelineState.tracks[trackId];
                const midiSourceId = (track as { midiSourceId?: string })?.midiSourceId;
                const cacheKey = midiSourceId ?? trackId;
                const bounds = (timelineState as any).midiCache?.[cacheKey]?.bounds;
                if (bounds) {
                    autoMinNote = bounds.minNote;
                    autoMaxNote = bounds.maxNote;
                }
            }
            minNote = rawMinNote === -1 ? autoMinNote : Math.max(0, Math.min(127, rawMinNote));
            maxNote = rawMaxNote === -1 ? autoMaxNote : Math.max(0, Math.min(127, rawMaxNote));
        } else {
            minNote = Math.max(0, Math.min(127, rawMinNote));
            maxNote = Math.max(0, Math.min(127, rawMaxNote));
        }
        const polarNoteHeight = Math.max(1, (p.polarNoteHeight as number) ?? 8);

        // Arc geometry
        const startAngleDeg = (p.startAngle as number) ?? 0;
        const endAngleDeg = (p.endAngle as number) ?? 360;
        const playheadPosition = Math.max(0, Math.min(1, (p.playheadPosition as number) ?? 0.5));
        const startAngleRad = clockDegToRad(startAngleDeg);
        let arcSpanDeg = (((endAngleDeg - startAngleDeg) % 360) + 360) % 360;
        if (arcSpanDeg === 0) arcSpanDeg = 360; // equal start/end = full circle
        const arcSpanRad = (arcSpanDeg * Math.PI) / 180;
        const endAngleRad = startAngleRad + arcSpanRad;
        const triggerAngle = startAngleRad + playheadPosition * arcSpanRad;

        const colorMode = (p.colorMode as string) ?? 'pitch';
        const noteColor = (p.noteColor as string) ?? '#FF6B6BCC';
        const pitchSaturation = Math.max(10, Math.min(100, (p.pitchSaturation as number) ?? 75));
        const pitchLightness = Math.max(20, Math.min(85, (p.pitchLightness as number) ?? 60));
        const noteOpacity = Math.max(0.05, Math.min(1, (p.noteOpacity as number) ?? 0.85));

        const showRing = (p.showRing as boolean) ?? true;
        const ringColor = (p.ringColor as string) ?? '#2A2A3A88';
        const showPolarGrid = (p.showPolarGrid as boolean) ?? true;
        const polarGridColor = (p.polarGridColor as string) ?? '#FFFFFF18';
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
        const bloomRadius = Math.max(0, (p.bloomRadius as number) ?? 0);

        const cx = 0;
        const cy = 0;

        // ── Query notes ──────────────────────────────────────────────────────
        const queryStart = targetTime - timeWindowDuration;
        const queryEnd = targetTime + timeWindowDuration;

        const notes = api.timeline.selectNotesInWindow({
            trackIds: [p.midiTrackId as string],
            startSec: queryStart,
            endSec: queryEnd,
        });

        // ── Time → angle ─────────────────────────────────────────────────────
        const timeToAngle = (t: number) => triggerAngle + ((t - targetTime) / timeWindowDuration) * arcSpanRad;

        const effects: RenderObject[] = [];

        // ════════════════════════════════════════════════════════════════════
        // RING MODE
        // ════════════════════════════════════════════════════════════════════
        if (ringMode === 'ring') {
            // Background ring
            if (showRing) {
                const bg = new Arc(cx, cy, ringRadius, startAngleRad, endAngleRad, false, {
                    fillColor: null,
                    strokeColor: ringColor,
                    strokeWidth: ringWidth,
                });
                bg.setLayoutParticipation('exclude');
                objects.push(bg);
            }

            const triggerX = cx + ringRadius * Math.cos(triggerAngle);
            const triggerY = cy + ringRadius * Math.sin(triggerAngle);

            for (const n of notes) {
                const startTime = n.startTime;
                const endTime = n.endTime ?? startTime + 0.25;
                const timeSinceHit = targetTime - startTime;

                let baseColor: string;
                if (colorMode === 'pitch') {
                    baseColor = pitchToColor(n.note, pitchSaturation, pitchLightness);
                } else {
                    baseColor = noteColor.slice(0, 7);
                }
                const noteStrokeColor = withAlpha(baseColor, noteOpacity);

                const angleStart = timeToAngle(startTime);
                const angleEnd = timeToAngle(endTime);

                if (angleEnd > angleStart) {
                    const clampedStart = Math.max(angleStart, startAngleRad);
                    const clampedEnd = Math.min(angleEnd, endAngleRad);

                    if (clampedEnd > clampedStart) {
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
                        arc.setLayoutParticipation('exclude');
                        objects.push(arc);
                    }
                }

                if (timeSinceHit >= 0) {
                    pushHitEffects(effects, triggerX, triggerY, timeSinceHit, {
                        markerType,
                        markerText,
                        markerSize,
                        markerColor,
                        markerDuration,
                        rippleType,
                        rippleRadius,
                        rippleColor,
                        rippleDuration,
                        circleRippleConfig: { startFraction: 0.05 },
                    });
                }
            }

            objects.push(...effects);

            // Trigger indicator
            if (showTriggerIndicator) {
                const cos = Math.cos(triggerAngle);
                const sin = Math.sin(triggerAngle);
                const innerR = ringRadius - ringWidth / 2 - 4;
                const outerR = ringRadius + ringWidth / 2 + triggerIndicatorLength;
                const ind = new Line(
                    cx + cos * innerR,
                    cy + sin * innerR,
                    cx + cos * outerR,
                    cy + sin * outerR,
                    triggerColor,
                    2
                );
                ind.setLayoutParticipation('exclude');
                objects.push(ind);
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // POLAR MODE — pitch maps to radius, time maps to angle
        // Equivalent to a cartesian piano roll bent into a circle:
        //   X axis (time) → angle around the circle
        //   Y axis (pitch) → distance from centre
        // ════════════════════════════════════════════════════════════════════
        else {
            const totalNotes = Math.max(1, maxNote - minNote + 1);
            const radialSpan = ringRadius - innerRadius;
            const laneHeight = radialSpan / totalNotes;

            // Note's centre radius (analogous to lane centre Y in cartesian roll)
            const radiusFromNote = (note: number) => innerRadius + (note - minNote + 0.5) * laneHeight;

            // Background fill ring (partial annulus)
            if (showRing) {
                // Draw as a wide arc centred on the midpoint radius
                const midRadius = (innerRadius + ringRadius) / 2;
                const bg = new Arc(cx, cy, midRadius, startAngleRad, endAngleRad, false, {
                    fillColor: null,
                    strokeColor: ringColor,
                    strokeWidth: radialSpan,
                });
                bg.setLayoutParticipation('exclude');
                objects.push(bg);
            }

            // Pitch grid lines (concentric arcs at lane boundaries)
            if (showPolarGrid) {
                drawPolarGrid(
                    cx,
                    cy,
                    innerRadius,
                    ringRadius,
                    minNote,
                    maxNote,
                    polarGridColor,
                    startAngleRad,
                    endAngleRad,
                    objects
                );
            }

            // Trigger radial line from inner to outer radius
            const triggerX = cx + ringRadius * Math.cos(triggerAngle);
            const triggerY = cy + ringRadius * Math.sin(triggerAngle);
            const triggerInnerX = cx + innerRadius * Math.cos(triggerAngle);
            const triggerInnerY = cy + innerRadius * Math.sin(triggerAngle);

            for (const n of notes) {
                const noteIdx = n.note - minNote;
                if (noteIdx < 0 || noteIdx >= totalNotes) continue;

                const startTime = n.startTime;
                const endTime = n.endTime ?? startTime + 0.25;
                const timeSinceHit = targetTime - startTime;

                let baseColor: string;
                if (colorMode === 'pitch') {
                    baseColor = pitchToColor(n.note, pitchSaturation, pitchLightness);
                } else {
                    baseColor = noteColor.slice(0, 7);
                }
                const noteStrokeColor = withAlpha(baseColor, noteOpacity);

                const angleStart = timeToAngle(startTime);
                const angleEnd = timeToAngle(endTime);

                if (angleEnd > angleStart) {
                    const clampedStart = Math.max(angleStart, startAngleRad);
                    const clampedEnd = Math.min(angleEnd, endAngleRad);

                    if (clampedEnd > clampedStart) {
                        const noteRadius = radiusFromNote(n.note);

                        // Pulse: expand radially (increase stroke width) on hit
                        let arcStrokeWidth = Math.min(polarNoteHeight, laneHeight);
                        if (pulseOnHit && timeSinceHit >= 0 && timeSinceHit <= animDuration) {
                            const progress = timeSinceHit / animDuration;
                            const env = Math.sin(Math.PI * progress);
                            arcStrokeWidth = arcStrokeWidth * (1 + (PULSE_ANIM.widthScale - 1) * env);
                        }

                        const arc = new Arc(cx, cy, noteRadius, clampedStart, clampedEnd, false, {
                            fillColor: null,
                            strokeColor: noteStrokeColor,
                            strokeWidth: arcStrokeWidth,
                        });
                        arc.setLayoutParticipation('exclude');
                        objects.push(arc);
                    }
                }

                // Hit effects: positioned at the note's radius on the trigger line
                if (timeSinceHit >= 0) {
                    const noteRadius = radiusFromNote(n.note);
                    const hitX = cx + noteRadius * Math.cos(triggerAngle);
                    const hitY = cy + noteRadius * Math.sin(triggerAngle);

                    pushHitEffects(effects, hitX, hitY, timeSinceHit, {
                        markerType,
                        markerText,
                        markerSize,
                        markerColor,
                        markerDuration,
                        rippleType,
                        rippleRadius,
                        rippleColor,
                        rippleDuration,
                        circleRippleConfig: { startFraction: 0.05 },
                    });
                }
            }

            objects.push(...effects);

            // Trigger radial line
            if (showTriggerIndicator) {
                const ind = new Line(triggerInnerX, triggerInnerY, triggerX, triggerY, triggerColor, 2);
                ind.setLayoutParticipation('exclude');
                objects.push(ind);
            }
        }

        // ── Layout sentinel ──────────────────────────────────────────────────
        const d = ringRadius + ringWidth / 2 + triggerIndicatorLength + 10;
        const layoutSentinel = new Rectangle(-d, -d, d * 2, d * 2, null, null, 0);
        layoutSentinel.setLayoutParticipation('include');

        if (bloomRadius > 0) {
            const glow = new GlowLayer({ glowBlur: bloomRadius });
            glow.addChildren(objects);
            // layoutSentinel must stay at the top level — the bounds system
            // only traverses top-level objects and GlowLayer is excluded by default.
            return [layoutSentinel, glow];
        }

        objects.push(layoutSentinel);
        return objects;
    }
}
