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
    return -(Math.pow((x - 0.5) * 2, 4)) + 1;
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

        const { noteSize, gap, spacing, squareColor, circleColor, showNoteNames, bounceDuration } = props;

        // All distinct pitches in the track — drives the permanent column layout
        const distinctPitches = api.timeline.selectDistinctNoteNumbers({ trackIds: [props.midiTrackId] });

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
        const fontSize = Math.max(8, Math.round(noteSize * 0.3));
        const boundsPad = 8;
        const boundsTop = restOffsetY - circleRadius - boundsPad;
        const boundsBottom = radius + 5 + fontSize + boundsPad;
        const boundsRect = new Rectangle(
            originX - boundsPad,
            boundsTop,
            totalWidth + boundsPad * 2,
            boundsBottom - boundsTop,
            null,
            "transparent",
            1,
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
                else if (nextNote === null) { nextNote = n; break; }
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
            } else  {
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
                strokeColor: 'transparent',
            });
            arc.setGlobalAlpha(circleAlpha);
            objects.push(arc);

            // --- Note name label ---
            if (showNoteNames) {
                const noteName = api.utilities.midiNoteToName(pitch);
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
