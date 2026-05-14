import {
    SceneElement,
    Rectangle,
    Arc,
    Text,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    parseFontSelection,
    ensureFontLoaded,
    prop,
    insertElementGroups,
    tab,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/** Returns a value in [0, 1]: 0 at x=0 and x=1 (note strike), 1 at x=0.5 (rest). */
function archCurve(x: number): number {
    return -Math.pow((x - 0.5) * 2, 4) + 1;
}

export class CollisionMidiDisplayElement extends SceneElement {
    constructor(id: string = 'collision-midi-display', config: Record<string, unknown> = {}) {
        super('collision-midi-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Collision Midi Display',
                description: 'MIDI display which shows notes as the collision of shapes',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'MIDI track to use as the note source',
                            }),
                        ],
                    },
                    {
                        id: 'noteRange',
                        label: 'Note Range',
                        collapsed: false,
                        description: 'Filter which MIDI notes are displayed.',
                        properties: [
                            prop.number('minNote', 'Min Note', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description: 'Only display notes at or above this MIDI note number',
                            }),
                            prop.number('maxNote', 'Max Note', 127, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description: 'Only display notes at or below this MIDI note number',
                            }),
                        ],
                        presets: [
                            {
                                id: 'debugLarge',
                                label: 'Debug Large',
                                description:
                                    'Large notes with a narrow pitch range — easier to read while debugging MIDI data',
                                values: { noteSize: 80, minNote: 60, maxNote: 68 },
                            },
                        ],
                    },
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('noteSize', 'Note Size', 40, { step: 1 }),
                            prop.number('gap', 'Gap', 16, {
                                step: 1,
                                description: 'Vertical distance between circle rest position and square',
                            }),
                            prop.number('spacing', 'Spacing', 12, {
                                step: 1,
                                description: 'Horizontal gap between note columns',
                            }),
                        ],
                    },
                    {
                        id: 'labels',
                        label: 'Labels',
                        collapsed: false,
                        properties: [
                            prop.boolean('showNoteNames', 'Show Note Names', true),
                            prop.font('labelFontFamily', 'Font', 'Inter', {
                                description: 'Font family for note name labels (Google Fonts supported).',
                                visibleWhen: [{ key: 'showNoteNames', truthy: true }],
                            }),
                            prop.number('labelFontSize', 'Font Size', 0, {
                                step: 1,
                                description: '0 = auto (scales with note size)',
                                visibleWhen: [{ key: 'showNoteNames', truthy: true }],
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'colors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('squareColor', 'Square', '#334155FF'),
                            prop.colorAlpha('squareActiveColor', 'Square (Active)', '#6366F1FF', {
                                description: 'Color the square takes on while the note is being held',
                            }),
                            prop.colorAlpha('circleColor', 'Circle', '#10B981FF'),
                        ],
                    },
                ]),
                tab.animation([
                    {
                        id: 'timing',
                        label: 'Timing',
                        collapsed: false,
                        properties: [
                            prop.number('bounceDuration', 'Bounce Duration (s)', 0.12, {
                                min: 0.02,
                                max: 0.5,
                                step: 0.01,
                                description: 'How long the square pop animation lasts when a note strikes',
                            }),
                        ],
                    },
                ]),
            ]
        );
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

        const {
            noteSize,
            gap,
            spacing,
            squareColor,
            squareActiveColor,
            circleColor,
            showNoteNames,
            labelFontFamily,
            labelFontSize,
            bounceDuration,
            minNote,
            maxNote,
        } = props;

        // Font pipeline — supports Google Fonts and custom assets via Family|weight token format
        const { family: fontFamily, weight: weightPart } = parseFontSelection(labelFontFamily ?? 'Inter');
        const fontWeight = (weightPart || '400').toString();
        const autoFontSize = Math.max(8, Math.round(noteSize * 0.3));
        const fontSize = labelFontSize > 0 ? labelFontSize : autoFontSize;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const labelFontString = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;

        // All distinct pitches in the track — filtered to the configured note range
        const distinctPitches = api.timeline
            .selectDistinctNoteNumbers({ trackIds: [props.midiTrackId] })
            .filter((p) => p >= minNote && p <= maxNote);

        if (distinctPitches.length === 0) {
            objects.push(new Text(0, 0, 'No notes in track', '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }

        const radius = noteSize / 2;
        const circleRadius = radius * 0.7;
        const slotWidth = noteSize + spacing;
        const totalWidth = distinctPitches.length * slotWidth - spacing;
        const originX = -totalWidth / 2;

        // Rest position: circle sits `gap` above the square (above = negative y)
        const restOffsetY = -(noteSize + gap);

        // Stable bounding rectangle — sized to the maximum extents, always the same shape
        const boundsPad = 8;
        const boundsTop = restOffsetY - circleRadius - boundsPad;
        const boundsBottom = radius + 5 + fontSize + boundsPad;
        const boundsRect = new Rectangle(
            originX - boundsPad,
            boundsTop,
            totalWidth + boundsPad * 2,
            boundsBottom - boundsTop,
            null,
            'transparent',
            1
        );
        boundsRect.cornerRadius = 4;
        objects.push(boundsRect);

        for (let col = 0; col < distinctPitches.length; col++) {
            const pitch = distinctPitches[col];
            const cx = originX + col * slotWidth + radius;

            // All notes for this pitch across the full timeline, sorted by startTime
            const pitchNotes = api.timeline.selectNotesByPitch(pitch, { trackIds: [props.midiTrackId] });

            // Find the surrounding notes: last one that has started, and next one coming up
            let prevNote = null;
            let nextNote = null;
            for (const n of pitchNotes) {
                if (n.startTime <= targetTime) prevNote = n;
                else if (nextNote === null) {
                    nextNote = n;
                    break;
                }
            }

            let circleOffsetY: number;
            let circleAlpha: number;
            let squareAlpha = 1.0;
            let squareScale = 1.0;

            if (prevNote === null && nextNote === null) {
                // Shouldn't happen since distinctPitches is non-empty, but guard anyway
                circleOffsetY = restOffsetY;
                circleAlpha = 0.2;
                squareAlpha = 0.5;
            } else if (prevNote === null && nextNote !== null) {
                // Before the first note for this pitch — resting
                const attackDuration = 1.5;
                const x = clamp((nextNote.startTime - targetTime) / attackDuration, 0, 1);
                circleOffsetY = restOffsetY * archCurve(x);
                circleAlpha = 0.4;
                squareAlpha = 0.7;
            } else if (nextNote === null && prevNote !== null) {
                // After the last note — half-arch decay back to rest over ~1.5s then hold
                const decayDuration = 1.5;
                const x = clamp((targetTime - prevNote.startTime) / (decayDuration * 2), 0, 0.5);
                circleOffsetY = restOffsetY * archCurve(x);
                circleAlpha = lerp(1.0, 0.3, x / 0.5);
                squareAlpha = lerp(1.0, 0.5, x / 0.5);
            } else if (nextNote !== null && prevNote !== null) {
                // Between two notes — continuous arch
                const period = nextNote.startTime - prevNote.startTime;
                const x = clamp(period > 0 ? (targetTime - prevNote.startTime) / period : 0, 0, 1);
                circleOffsetY = restOffsetY * archCurve(x);
                circleAlpha = 1.0;
            } else {
                // Shouldn't happen, but just in case
                circleOffsetY = restOffsetY;
                circleAlpha = 0.4;
                squareAlpha = 0.7;
            }

            // Square pop on strike — time-based, independent of note spacing
            const timeSinceHit = prevNote !== null ? targetTime - prevNote.startTime : Infinity;
            if (timeSinceHit >= 0 && timeSinceHit < bounceDuration) {
                const t = clamp(timeSinceHit / bounceDuration, 0, 1);
                squareScale = lerp(1.12, 1.0, easeOutCubic(t));
                squareAlpha = lerp(1.0, 0.85, t);
            }

            const isNoteActive =
                prevNote !== null && targetTime >= prevNote.startTime && targetTime <= prevNote.endTime;
            const effectiveSquareColor = isNoteActive ? squareActiveColor : squareColor;

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
            const sq = new Rectangle(sqX, sqY, sqSize, sqSize, effectiveSquareColor);
            sq.setGlobalAlpha(squareAlpha);
            objects.push(sq);

            // --- Circle ---
            const arc = new Arc(cx, circleOffsetY, circleRadius, 0, Math.PI * 2, false, {
                fillColor: circleColor,
                strokeColor: 'transparent',
            });
            arc.setGlobalAlpha(circleAlpha);
            objects.push(arc);

            // --- Note name label ---
            if (showNoteNames) {
                const noteName = api.utilities.midiNoteToName(pitch);
                const label = new Text(cx, radius + 5, noteName, labelFontString, '#94a3b8', 'center', 'top');
                objects.push(label);
            }
        }

        return objects;
    }
}
