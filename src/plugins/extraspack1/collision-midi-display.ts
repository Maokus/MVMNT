import {
    SceneElement,
    asNumber,
    asTrimmedString,
    Rectangle,
    Arc,
    Text,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type PropertyTransform,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema, SceneElementInterface } from '@mvmnt/plugin-sdk';

const normalizeMidiTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

function easeInCubic(t: number): number {
    return t * t * t;
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

export class CollisionMidiDisplayElement extends SceneElement {
    constructor(id: string = 'collision-midi-display', config: Record<string, unknown> = {}) {
        super('collision-midi-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');

        return {
            ...base,
            name: 'Collision Midi Display',
            description: 'MIDI display which shows notes as the collision of shapes',
            category: 'extraspack1',
            groups: [
                ...basicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'timelineTrackRef',
                            label: 'MIDI Track',
                            default: null,
                            allowedTrackTypes: ['midi'],
                            description: 'MIDI track to use as the note source',
                            runtime: { transform: normalizeMidiTrackId, defaultValue: null },
                        },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'noteSize',
                            type: 'number',
                            label: 'Note Size',
                            default: 40,
                            min: 10,
                            max: 120,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 40 },
                        },
                        {
                            key: 'gap',
                            type: 'number',
                            label: 'Gap',
                            default: 16,
                            min: 4,
                            max: 80,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 16 },
                        },
                        {
                            key: 'spacing',
                            type: 'number',
                            label: 'Spacing',
                            default: 12,
                            min: 0,
                            max: 60,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 12 },
                        },
                        {
                            key: 'squareColor',
                            type: 'colorAlpha',
                            label: 'Square Color',
                            default: '#334155FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#334155FF' },
                        },
                        {
                            key: 'circleColor',
                            type: 'colorAlpha',
                            label: 'Circle Color',
                            default: '#10B981FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#10B981FF' },
                        },
                        {
                            key: 'showNoteNames',
                            type: 'boolean',
                            label: 'Show Note Names',
                            default: true,
                            runtime: {
                                transform: (value) => {
                                    if (typeof value === 'boolean') return value;
                                    if (typeof value === 'string') return value.toLowerCase() === 'true';
                                    return true;
                                },
                                defaultValue: true,
                            },
                        },
                    ],
                },
                {
                    id: 'timing',
                    label: 'Timing',
                    variant: 'basic',
                    collapsed: true,
                    properties: [
                        {
                            key: 'lookaheadSec',
                            type: 'number',
                            label: 'Lookahead (s)',
                            default: 2.0,
                            min: 0.1,
                            max: 10.0,
                            step: 0.1,
                            runtime: { transform: asNumber, defaultValue: 2.0 },
                        },
                        {
                            key: 'anticipationSec',
                            type: 'number',
                            label: 'Anticipation (s)',
                            default: 0.5,
                            min: 0.05,
                            max: 2.0,
                            step: 0.05,
                            runtime: { transform: asNumber, defaultValue: 0.5 },
                        },
                        {
                            key: 'bounceDuration',
                            type: 'number',
                            label: 'Bounce Duration (s)',
                            default: 0.12,
                            min: 0.02,
                            max: 0.5,
                            step: 0.01,
                            runtime: { transform: asNumber, defaultValue: 0.12 },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.midiTrackId) {
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top'));
            return objects;
        }

        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        if (!api || status !== 'ok') {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                      ? 'Timeline API unavailable'
                      : 'Plugin host API unavailable';
            objects.push(new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }

        const { noteSize, gap, spacing, squareColor, circleColor, showNoteNames, lookaheadSec, anticipationSec, bounceDuration } =
            props;

        // Query notes slightly behind (to see recent strikes) and ahead (for approach animation)
        const lookbehindSec = bounceDuration + 0.05;
        const notes = api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: targetTime - lookbehindSec,
            endSec: targetTime + lookaheadSec,
        });

        if (notes.length === 0) {
            objects.push(new Text(0, 0, 'No notes in range', '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }

        // Unique pitches in this window, sorted low-to-high
        const uniquePitches = [...new Set(notes.map((n) => n.note))].sort((a, b) => a - b);

        const radius = noteSize / 2;
        const circleRadius = radius * 0.7;
        const slotWidth = noteSize + spacing;
        const totalWidth = uniquePitches.length * slotWidth - spacing;
        const originX = -totalWidth / 2;

        // Rest position: circle sits `gap` above the square (above = negative y)
        const restOffsetY = -(noteSize + gap);

        for (let col = 0; col < uniquePitches.length; col++) {
            const pitch = uniquePitches[col];
            const cx = originX + col * slotWidth + radius;

            // Collect all notes for this pitch in the window, sorted by startTime
            const pitchNotes = notes
                .filter((n) => n.note === pitch)
                .sort((a, b) => a.startTime - b.startTime);

            // Find the most relevant note: closest startTime to targetTime
            let bestNote = pitchNotes[0];
            for (const n of pitchNotes) {
                if (Math.abs(n.startTime - targetTime) < Math.abs(bestNote.startTime - targetTime)) {
                    bestNote = n;
                }
            }

            const timeToStart = bestNote.startTime - targetTime;

            // Compute circle vertical offset and opacities
            let circleOffsetY: number;
            let circleAlpha: number;
            let squareAlpha = 1.0;
            let squareScale = 1.0;

            if (timeToStart < 0 && timeToStart > -bounceDuration) {
                // Just struck — circle bounces back from 0 toward rest
                const t = clamp(-timeToStart / bounceDuration, 0, 1);
                circleOffsetY = lerp(0, restOffsetY * 0.65, easeOutCubic(t));
                circleAlpha = 1.0;
                // Square reacts: brief scale-pop
                squareScale = lerp(1.12, 1.0, easeOutCubic(t));
                squareAlpha = lerp(1.0, 0.85, t);
            } else if (timeToStart >= 0 && timeToStart <= anticipationSec) {
                // Approaching — circle moves from rest toward the square
                const t = clamp(1.0 - timeToStart / anticipationSec, 0, 1);
                circleOffsetY = lerp(restOffsetY, 0, easeInCubic(t));
                circleAlpha = lerp(0.5, 1.0, t);
            } else {
                // Resting — either past the bounce or too far ahead
                circleOffsetY = restOffsetY;
                if (timeToStart > 0) {
                    // Upcoming but outside anticipation window: fade by distance
                    circleAlpha = lerp(0.15, 0.5, clamp(1.0 - timeToStart / lookaheadSec, 0, 1));
                } else {
                    // Past note: dim
                    circleAlpha = 0.3;
                }
            }

            // --- Square ---
            let sqX = cx - radius;
            let sqY = -radius;
            let sqSize = noteSize;
            if (squareScale !== 1.0) {
                sqSize = noteSize * squareScale;
                const offset = (sqSize - noteSize) / 2;
                sqX -= offset;
                sqY -= offset;
            }
            const sq = new Rectangle(sqX, sqY, sqSize, sqSize, squareColor);
            sq.setGlobalAlpha(squareAlpha);
            objects.push(sq);

            // --- Circle ---
            const arc = new Arc(cx, circleOffsetY, circleRadius, 0, Math.PI * 2, false, {
                fillColor: circleColor,
                strokeColor: null,
            });
            arc.setGlobalAlpha(circleAlpha);
            objects.push(arc);

            // --- Note name label ---
            if (showNoteNames) {
                const noteName = api.utilities.midiNoteToName(pitch);
                const fontSize = Math.max(8, Math.round(noteSize * 0.3));
                const label = new Text(
                    cx,
                    radius + 5,
                    noteName,
                    `${fontSize}px Inter, sans-serif`,
                    '#94a3b8',
                    'center',
                    'top',
                );
                objects.push(label);
            }
        }

        return objects;
    }
}
