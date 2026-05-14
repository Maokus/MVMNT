// VidilikePianoRoll — notes scroll right-to-left past a static playhead.
// When a note's head crosses the playhead a marker, ripple, and/or animation trigger.

import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    Rectangle,
    Text,
    Line,
    GlowLayer,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';
import { pushHitEffects, getPressTransform, getPluckTransform } from './piano-roll-effects';

// ─────────────────────────────────────────────────────────────────────────────
// Element
// ─────────────────────────────────────────────────────────────────────────────

export class VidilikePianoRollElement extends SceneElement {
    constructor(id: string = 'vidilike-piano-roll', config: Record<string, unknown> = {}) {
        super('vidilike-piano-roll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Vidilike Piano Roll',
                description:
                    'Notes scroll right-to-left; markers and ripples trigger when a note crosses the playhead.',
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
                        label: 'Layout & Range',
                        collapsed: false,
                        properties: [
                            prop.number('rollWidth', 'Roll Width (px)', 1200, { step: 10 }),
                            prop.number('timeUnitBars', 'Time Window (bars)', 2, { min: 1, max: 8, step: 1 }),
                            prop.number('minNote', 'Min MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Lowest note shown. Set to -1 to auto-detect from the track.',
                            }),
                            prop.number('maxNote', 'Max MIDI Note', -1, {
                                min: -1,
                                max: 127,
                                step: 1,
                                description: 'Highest note shown. Set to -1 to auto-detect from the track.',
                            }),
                            prop.number('noteHeight', 'Note Height (px)', 20, { step: 1 }),
                            prop.number('playheadPosition', 'Playhead Position (0–1)', 0.25, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'notes',
                        label: 'Notes',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('noteColor', 'Note Color', '#FFFFFFFF'),
                            prop.number('noteCornerRadius', 'Corner Radius (px)', 2, { step: 1 }),
                        ],
                    },
                    {
                        id: 'playhead',
                        label: 'Playhead',
                        collapsed: true,
                        properties: [
                            prop.boolean('showPlayhead', 'Show Playhead', false),
                            prop.colorAlpha('playheadColor', 'Playhead Color', '#FFFFFFFF', {
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                            prop.number('playheadLineWidth', 'Playhead Width (px)', 2, {
                                step: 1,
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                        ],
                    },
                    {
                        id: 'marker',
                        label: 'Marker',
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
                            prop.number('markerSize', 'Marker Size (px)', 40, { step: 1 }),
                            prop.color('markerColor', 'Marker Color', '#FFFFFF'),
                            prop.number('markerDuration', 'Marker Duration (s)', 0.5, {
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
                        description: 'Effect that emanates from the playhead when a note is hit.',
                        properties: [
                            prop.select('rippleType', 'Ripple', 'circle', [
                                { value: 'burst', label: 'Burst' },
                                { value: 'circle', label: 'Circle' },
                                { value: 'none', label: 'No Ripple' },
                            ]),
                            prop.number('rippleRadius', 'Ripple Radius (px)', 70, {
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
                        description: 'Animation played on the note itself when it crosses the playhead.',
                        properties: [
                            prop.select('animationType', 'Animation', 'press', [
                                { value: 'press', label: 'Press' },
                                { value: 'pluck', label: 'Pluck' },
                                { value: 'none', label: 'No Animation' },
                            ]),
                            prop.number('animationDuration', 'Animation Duration (s)', 0.3, {
                                min: 0.05,
                                max: 2,
                                step: 0.05,
                                visibleWhen: [{ key: 'animationType', notEquals: 'none' }],
                            }),
                        ],
                    },
                    {
                        id: 'bloom',
                        label: 'Bloom',
                        collapsed: true,
                        description: 'Glow effect applied to note bodies. Large radii are expensive — keep below 30.',
                        properties: [prop.number('bloomRadius', 'Bloom Radius (px)', 0, { step: 1, min: 0, max: 40 })],
                    },
                ]),
                tab.advanced([
                    {
                        id: 'shake',
                        label: 'Shake',
                        collapsed: true,
                        description: 'Camera shake and zoom that triggers when a note crosses the playhead.',
                        properties: [
                            prop.boolean('enableShake', 'Enable Shake', false),
                            prop.number('zoomIntensity', 'Zoom Intensity', 5, {
                                step: 0.5,
                                visibleWhen: [{ key: 'enableShake', truthy: true }],
                            }),
                            prop.number('shakeIntensity', 'Shake Intensity', 8, {
                                step: 0.5,
                                visibleWhen: [{ key: 'enableShake', truthy: true }],
                            }),
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
        // For press: springDuration after note ends. For pluck: total duration.
        const animDuration = Math.max(0.05, (p.animationDuration as number) ?? 0.3);
        const bloomRadius = Math.max(0, (p.bloomRadius as number) ?? 0);

        const enableShake = (p.enableShake as boolean) ?? false;
        const zoomIntensity = Math.max(0, (p.zoomIntensity as number) ?? 5);
        const shakeIntensity = Math.max(0, (p.shakeIntensity as number) ?? 8);

        // ── Query window ────────────────────────────────────────────────────
        const maxEffectDuration = Math.max(markerDuration, rippleDuration, animDuration);
        const windowStart = targetTime - playheadPosition * timeUnitDuration;
        const windowEnd = targetTime + (1 - playheadPosition) * timeUnitDuration;
        const queryStart = windowStart - maxEffectDuration;

        const notes = api.timeline.selectNotesInWindow({
            trackIds: [p.midiTrackId as string],
            startSec: queryStart,
            endSec: windowEnd,
        });

        const xFromTime = (t: number) => playheadX + ((t - targetTime) / timeUnitDuration) * rollWidth;
        const yFromNote = (note: number) => (maxNote - note) * noteHeight;

        // ── Shake / zoom ────────────────────────────────────────────────────
        // First pass: compute peak shake strength from recent note hits.
        let shakeStrength = 0;
        if (enableShake) {
            const shakeDecay = 0.25; // seconds
            for (const n of notes) {
                const tsh = targetTime - n.startTime;
                if (tsh >= 0 && tsh < shakeDecay) {
                    shakeStrength = Math.max(shakeStrength, 1 - tsh / shakeDecay);
                }
            }
        }
        const shakeOffsetX = enableShake ? Math.sin(targetTime * 60 * Math.PI) * shakeIntensity * shakeStrength : 0;
        const shakeOffsetY = enableShake ? Math.cos(targetTime * 78 * Math.PI) * shakeIntensity * shakeStrength : 0;
        const zoomScale = enableShake ? 1 + (zoomIntensity / 100) * shakeStrength : 1;
        const zoomOriginX = playheadX;
        const zoomOriginY = (totalNotes * noteHeight) / 2;

        const applyShake = (x: number, y: number): [number, number] => {
            const sx = zoomOriginX + (x - zoomOriginX) * zoomScale + shakeOffsetX;
            const sy = zoomOriginY + (y - zoomOriginY) * zoomScale + shakeOffsetY;
            return [sx, sy];
        };

        const effects: RenderObject[] = [];

        for (const n of notes) {
            const noteIdx = n.note - minNote;
            if (noteIdx < 0 || noteIdx >= totalNotes) continue;

            const startTime = n.startTime;
            const endTime = n.endTime ?? startTime + 0.25;
            const noteDuration = endTime - startTime;
            const timeSinceHit = targetTime - startTime;

            const xNoteStart = xFromTime(startTime);
            const xNoteEnd = xFromTime(endTime);
            const drawLeft = Math.max(0, xNoteStart);
            const drawRight = Math.min(rollWidth, xNoteEnd);

            // Compute animation transform (needed for effectCy even when note is off-screen)
            let animDy = 0;
            let animDh = 0;
            if (animType !== 'none' && timeSinceHit >= 0) {
                if (animType === 'press') {
                    const maxAnimTime = noteDuration + animDuration;
                    if (timeSinceHit <= maxAnimTime) {
                        const transform = getPressTransform(timeSinceHit, noteDuration, animDuration, noteHeight);
                        animDy = transform.dy;
                        animDh = transform.dh;
                    }
                } else if (animType === 'pluck' && timeSinceHit <= animDuration) {
                    const progress = timeSinceHit / animDuration;
                    const transform = getPluckTransform(progress, noteHeight);
                    animDy = transform.dy;
                    animDh = transform.dh;
                }
            }

            // ── Note body ────────────────────────────────────────────────────
            if (drawRight > 0 && drawLeft < rollWidth && drawRight > drawLeft) {
                const rawY = yFromNote(n.note) + animDy;
                const rectH = Math.max(1, noteHeight + animDh);
                const [sx, sy] = applyShake(drawLeft, rawY);
                const [sx2] = applyShake(drawRight, rawY);
                const rect = new Rectangle(sx, sy, sx2 - sx, rectH * zoomScale, noteColor);
                if (noteCornerRadius > 0) (rect as any).setCornerRadius?.(noteCornerRadius);
                (rect as any).setIncludeInLayoutBounds?.(false);
                objects.push(rect);
            }

            // ── Hit effects ─────────────────────────────────────────────────
            if (timeSinceHit >= 0) {
                const [effectCx, effectCy] = applyShake(
                    playheadX,
                    yFromNote(n.note) + animDy + (noteHeight + animDh) / 2
                );
                const noteSeed = n.note * 7919 + Math.round(startTime * 100);

                pushHitEffects(effects, effectCx, effectCy, timeSinceHit, {
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
                    circleRippleConfig: { startFraction: 0.1 },
                });
            }
        }

        // ── Assemble final output ───────────────────────────────────────────
        const totalHeight = totalNotes * noteHeight;
        const layoutSentinel = new Rectangle(0, 0, rollWidth, totalHeight, null, null, 0);
        (layoutSentinel as any).setIncludeInLayoutBounds?.(true);

        // Build playhead separately so it always stays sharp (not bloomed)
        const decorations: RenderObject[] = [];
        if (showPlayhead) {
            const [phX] = applyShake(playheadX, 0);
            const ph = new Line(phX, 0, phX, totalHeight, playheadColor, playheadLineWidth);
            (ph as any).setIncludeInLayoutBounds?.(false);
            decorations.push(ph);
        }

        if (bloomRadius > 0) {
            // Only bloom note bodies — effects (markers, ripples) and playhead
            // render sharp on top of the bloom layer.
            const glow = new GlowLayer({ glowBlur: bloomRadius });
            glow.addChildren(objects);
            return [layoutSentinel, glow, ...effects, ...decorations];
        }

        return [layoutSentinel, ...objects, ...effects, ...decorations];
    }
}
