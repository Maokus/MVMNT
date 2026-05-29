// MovingNotesPianoRoll scene element: static playhead, notes move across.
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema, type PropertyDefinition } from '@core/types.js';
import { Line, EmptyRenderObject, RenderObject, Rectangle, GlowLayer } from '@core/render/render-objects';
import { getAnimationSelectOptions } from '@core/scene/elements/midi-displays/note-animations';
import { normalizeColorAlphaValue, ensureEightDigitHex, applyOpacity } from '@utils/color';
import { MovingNotesAnimationController } from './animation-controller';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { TimingManager } from '@core/timing';
import { insertElementConfig, prop } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

const DEFAULT_NOTE_COLOR = '#FF6B6B';

const applyLegacyOpacity = (color: string, opacity?: number): string => {
    const sanitized = ensureEightDigitHex(color, DEFAULT_NOTE_COLOR);
    if (opacity === undefined || opacity === null) {
        return sanitized;
    }
    return applyOpacity(sanitized, opacity);
};

export class MovingNotesPianoRollElement extends SceneElement {
    public animationController: MovingNotesAnimationController;
    private timingManager: TimingManager;

    constructor(id: string = 'movingNotesPianoRoll', config: { [key: string]: any } = {}) {
        super('movingNotesPianoRoll', id, config);
        this.animationController = new MovingNotesAnimationController(this);
        this.timingManager = new TimingManager(this.id);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const channelColorDefaults = [
            '#ff6b6b',
            '#4ecdc4',
            '#45b7d1',
            '#96ceb4',
            '#feca57',
            '#ff9ff3',
            '#54a0ff',
            '#5f27cd',
            '#00d2d3',
            '#ff9f43',
            '#10ac84',
            '#ee5a24',
            '#0984e3',
            '#a29bfe',
            '#fd79a8',
            '#e17055',
        ];
        const channelColorProperties: PropertyDefinition[] = Array.from({ length: 16 }, (_, i) =>
            prop.color(`channel${i}Color`, `Channel ${i + 1}`, channelColorDefaults[i], {
                visibleWhen: [
                    { key: 'showNotes', truthy: true },
                    { key: 'useChannelColors', truthy: true },
                ],
            })
        );

        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Moving Notes Piano Roll',
                description: 'Notes move past a static playhead',
                category: 'MIDI Displays',
            },
            [
                tab.content([
                    propGroup.midiSource(),
                    {
                        id: 'dimensions',
                        label: 'Layout & Range',
                        collapsed: false,
                        description: 'Configure viewport width, time window, and pitch range.',
                        properties: [
                            prop.number('rollWidth', 'Roll Width (px)', 800, {
                                min: 100,
                                max: 4000,
                                step: 10,
                                description: 'Total width for the moving-notes viewport.',
                            }),
                            prop.number('rollHeight', 'Roll Height (px)', 400, {
                                min: 20,
                                max: 4000,
                                step: 10,
                                description: 'Total height of the piano roll.',
                            }),
                            prop.number('timeUnitBars', 'Time Unit (bars)', 1, { min: 1, max: 8, step: 1 }),
                            prop.boolean('autoRange', 'Auto Range', false, {
                                description: 'Automatically detect min/max note from the track.',
                            }),
                            prop.number('minNote', 'Minimum MIDI Note', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description: 'Lowest MIDI note shown.',
                                visibleWhen: [{ key: 'autoRange', notEquals: true }],
                            }),
                            prop.number('maxNote', 'Maximum MIDI Note', 127, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description: 'Highest MIDI note shown.',
                                visibleWhen: [{ key: 'autoRange', notEquals: true }],
                            }),
                        ],
                    },
                    {
                        id: 'notes',
                        label: 'Notes',
                        collapsed: false,
                        description: 'Control how notes are drawn as they move past the playhead.',
                        properties: [
                            prop.boolean('showNotes', 'Show Notes', true),
                            prop.boolean('useChannelColors', 'Use Per-Channel Colors', false, {
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteCornerRadius', 'Note Corner Radius (px)', 2, {
                                min: 0,
                                max: 20,
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.color('noteStrokeColor', 'Note Stroke Color', '#ffffff', {
                                visibleWhen: [
                                    { key: 'showNotes', truthy: true },
                                    { key: 'noteStrokeWidth', truthy: true },
                                ],
                            }),
                            prop.number('noteStrokeWidth', 'Note Stroke Width (px)', 0, {
                                min: 0,
                                max: 10,
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteGlowBlur', 'Note Glow Blur (px)', 0, {
                                min: 0,
                                max: 50,
                                step: 1,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            prop.number('noteGlowOpacity', 'Note Glow Opacity', 0.5, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showNotes', truthy: true }],
                            }),
                            ...channelColorProperties,
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        description: 'Choose how notes animate when triggered.',
                        properties: [
                            prop.select('animationType', 'Animation Type', 'expand', [
                                ...getAnimationSelectOptions(),
                                { value: 'none', label: 'No Animation' },
                            ]),
                            prop.number('attackDuration', 'Attack Duration (s)', 0.3, { min: 0, max: 10, step: 0.05 }),
                            prop.number('decayDuration', 'Decay Duration (s)', 0.3, { min: 0, max: 10, step: 0.05 }),
                            prop.number('releaseDuration', 'Release Duration (s)', 0.3, {
                                min: 0,
                                max: 10,
                                step: 0.05,
                            }),
                            prop.number('playheadPosition', 'Playhead Position (0–1)', 0.5, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                            prop.number('playheadOffset', 'Playhead Offset (px)', 0, {
                                min: -4000,
                                max: 4000,
                                step: 1,
                                description: 'Pixel offset added to playhead position within the element width.',
                            }),
                        ],
                    },
                    {
                        id: 'playhead',
                        label: 'Playhead',
                        collapsed: false,
                        description: 'Style the static playhead indicator.',
                        properties: [
                            prop.boolean('showPlayhead', 'Show Playhead', true),
                            prop.color('playheadColor', 'Playhead Color', '#ff6b6b', {
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                            prop.range('playheadOpacity', 'Playhead Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                            prop.number('playheadLineWidth', 'Playhead Line Width (px)', 2, {
                                min: 1,
                                max: 10,
                                step: 1,
                                visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                            }),
                        ],
                    },
                ]),
                tab.custom('annotation', 'Annotation', [
                    {
                        id: 'piano',
                        label: 'Piano',
                        collapsed: false,
                        description: 'Optional static keyboard rendered alongside the roll.',
                        properties: [
                            prop.boolean('showPiano', 'Show Piano', false),
                            prop.number('pianoWidth', 'Piano Width (px)', 100, {
                                min: 80,
                                max: 300,
                                step: 10,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('whiteKeyColor', 'White Key Color', '#f0f0f0', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('blackKeyColor', 'Black Key Color', '#555555', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.number('pianoOpacity', 'Piano Opacity', 1, {
                                min: 0,
                                max: 1,
                                step: 0.05,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.color('pianoRightBorderColor', 'Piano Right Border', '#333333', {
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                            prop.number('pianoRightBorderWidth', 'Piano Right Border Width (px)', 2, {
                                min: 0,
                                max: 10,
                                step: 1,
                                visibleWhen: [{ key: 'showPiano', truthy: true }],
                            }),
                        ],
                    },
                ]),
                tab.appearance([propGroup.appearance()]),
            ]
        );
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const renderObjects: RenderObject[] = [];
        const effectiveTime = targetTime;
        const timeUnitBars = props.timeUnitBars as number;
        const pianoWidth = props.pianoWidth as number;
        const rollWidth = props.rollWidth as number;
        const rollHeight = props.rollHeight as number;
        const showNotes = props.showNotes as boolean;
        const showPlayhead = props.showPlayhead as boolean;
        const playheadLineWidth = props.playheadLineWidth as number;
        const playheadColor = applyOpacity(props.playheadColor as string, props.playheadOpacity as number);
        const playheadPosition = props.playheadPosition as number;
        const playheadOffset = props.playheadOffset as number;
        const showPiano = props.showPiano as boolean;
        const whiteKeyColor = props.whiteKeyColor as string;
        const blackKeyColor = props.blackKeyColor as string;
        const pianoOpacity = props.pianoOpacity as number;
        const pianoRightBorderColor = props.pianoRightBorderColor as string;
        const pianoRightBorderWidth = props.pianoRightBorderWidth as number;
        const effectivePianoWidth = showPiano ? pianoWidth : 0;
        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        const timelineState = host.ok ? host.api.timeline.getStateSnapshot() : null;

        const autoRange = props.autoRange as boolean;
        const rawMinNote = props.minNote as number;
        const rawMaxNote = props.maxNote as number;
        let minNote: number;
        let maxNote: number;
        if (autoRange) {
            const trackId = props.midiTrackId as string | undefined;
            const range = trackId && host.ok ? host.api.timeline.getNoteRange({ trackIds: [trackId] }) : null;
            minNote = range?.min ?? 0;
            maxNote = range?.max ?? 127;
        } else {
            minNote = rawMinNote;
            maxNote = rawMaxNote;
        }
        const numNotes = Math.max(1, maxNote - minNote + 1);
        const noteHeight = rollHeight / numNotes;

        // Update local timing manager from global timeline snapshot for view window duration calculations
        try {
            const bpm = timelineState?.timeline.globalBpm || 120;
            const beatsPerBar = timelineState?.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            // If a master tempo map exists, apply to timing manager for accurate windows
            if (timelineState?.timeline.masterTempoMap && timelineState.timeline.masterTempoMap.length > 0) {
                this.timingManager.setTempoMap(timelineState.timeline.masterTempoMap, 'seconds');
            } else {
                this.timingManager.setTempoMap(null);
            }
        } catch {}

        // Draw piano strip (left) so pianoWidth visually applies
        if (showPiano) {
            const totalHeight = (maxNote - minNote + 1) * noteHeight;
            // Draw keys from top (maxNote) to bottom (minNote)
            for (let n = maxNote, i = 0; n >= minNote; n--, i++) {
                const y = i * noteHeight;
                const pitchClass = n % 12;
                const isBlack =
                    pitchClass === 1 || pitchClass === 3 || pitchClass === 6 || pitchClass === 8 || pitchClass === 10;
                const col = isBlack ? blackKeyColor : whiteKeyColor;
                const key = new Rectangle(0, y, pianoWidth, noteHeight, { fillColor: col });
                key.opacity = pianoOpacity;
                renderObjects.push(key);
            }
            // Right border to separate piano from roll area
            if ((pianoRightBorderWidth || 0) > 0) {
                const border = new Line(pianoWidth, 0, pianoWidth, (maxNote - minNote + 1) * noteHeight, {
                    color: pianoRightBorderColor as string,
                    lineWidth: pianoRightBorderWidth,
                });
                renderObjects.push(border);
            }
        }

        // Determine window around current time
        const duration = this.timingManager.getTimeUnitDuration(timeUnitBars);
        const windowStart = effectiveTime - duration * playheadPosition;
        const windowEnd = windowStart + duration;

        // Fetch notes for this window from public plugin host API
        const rawNotes =
            props.midiTrackId && host.ok
                ? host.api.timeline
                      .selectNotesInWindow({
                          trackIds: [props.midiTrackId as string],
                          startSec: windowStart,
                          endSec: windowEnd,
                      })
                      .map((n) => ({
                          note: n.note,
                          channel: n.channel,
                          velocity: n.velocity || 0,
                          startTime: n.startTime,
                          endTime: n.endTime,
                      }))
                : [];

        // Notes moving past static playhead
        if (showNotes && rawNotes && (rawNotes as any[]).length > 0) {
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                {
                    noteHeight,
                    minNote,
                    maxNote,
                    pianoWidth: effectivePianoWidth,
                    rollWidth: rollWidth,
                    playheadPosition,
                    playheadOffset: playheadOffset as number,
                    windowStart,
                    windowEnd,
                    currentTime: effectiveTime,
                },
                rawNotes as any
            );

            // Style customizations
            const noteCornerRadius = props.noteCornerRadius as number;
            const noteStrokeColor = props.noteStrokeColor as string;
            const noteStrokeWidth = props.noteStrokeWidth as number;
            const noteGlowBlur = props.noteGlowBlur as number;
            const noteGlowOpacity = props.noteGlowOpacity as number;
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0)
                    obj.setCornerRadius(noteCornerRadius);
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function')
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
            });
            if (noteGlowBlur > 0) {
                // GlowLayer renders notes twice: once normally, once blurred+screened.
                // The halo colour derives from each note's own fill colour — on dark
                // backgrounds, screen blending creates a natural per-note radiance effect.
                const glowLayer = new GlowLayer({ glowBlur: noteGlowBlur, glowOpacity: noteGlowOpacity });
                glowLayer.addChildren(animatedRenderObjects);
                renderObjects.push(glowLayer);
            } else {
                renderObjects.push(...animatedRenderObjects);
            }
        }

        // Add a non-drawing rectangle to establish layout bounds for the content area
        {
            const totalHeight = (maxNote - minNote + 1) * noteHeight;
            const layoutRect = new Rectangle(0, 0, effectivePianoWidth + rollWidth, totalHeight, { fillColor: null });
            (layoutRect as any).setIncludeInLayoutBounds?.(true);
            renderObjects.push(layoutRect);
        }

        if (showPlayhead) {
            const ph = this._createStaticPlayhead(
                effectivePianoWidth,
                rollWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor as string,
                playheadPosition,
                playheadOffset as number
            );
            (ph as any[]).forEach((l) => {
                (l as any).setIncludeInLayoutBounds?.(false);
            });
            renderObjects.push(...ph);
        }

        return renderObjects;
    }

    private _createStaticPlayhead(
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number,
        lineWidth: number,
        playheadColor: string,
        playheadPosition: number,
        playheadOffset: number
    ): RenderObject[] {
        const minX = pianoWidth;
        const maxX = pianoWidth + rollWidth;
        const unclamped = pianoWidth + rollWidth * playheadPosition + playheadOffset;
        const x = Math.max(minX, Math.min(maxX, unclamped));
        const playhead = Line.createPlayhead
            ? Line.createPlayhead(x, 0, totalHeight, playheadColor, lineWidth)
            : new Line(x, 0, x, totalHeight, { color: playheadColor, lineWidth });
        return [playhead];
    }

    getAnimationType(): string {
        return (this.getSchemaProps().animationType as string | undefined) ?? 'expand';
    }

    getAttackDuration(): number {
        return Math.max(0, (this.getSchemaProps().attackDuration as number | undefined) ?? 0.3);
    }

    getDecayDuration(): number {
        return Math.max(0, (this.getSchemaProps().decayDuration as number | undefined) ?? 0.3);
    }

    getReleaseDuration(): number {
        return Math.max(0, (this.getSchemaProps().releaseDuration as number | undefined) ?? 0.3);
    }

    getTimeUnitBars(): number {
        return Math.max(1, Math.round((this.getSchemaProps().timeUnitBars as number | undefined) ?? 1));
    }

    setTimeUnitBars(bars: number): this {
        this.setProperty('timeUnitBars', bars);
        return this;
    }

    getTimeUnit(): number {
        return this.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }

    getChannelColors(): string[] {
        const props = this.getSchemaProps();
        const baseColor = applyOpacity(
            (props.color ?? props.noteColor ?? props.channel0Color ?? DEFAULT_NOTE_COLOR) as string,
            (props.opacity ?? props.noteOpacity ?? 0.8) as number
        );
        if (!props.useChannelColors) {
            return Array.from({ length: 16 }, () => baseColor);
        }

        return Array.from({ length: 16 }, (_, index) => {
            const rawChannelColor = props[`channel${index}Color`] as string | undefined;
            return rawChannelColor ? normalizeColorAlphaValue(rawChannelColor, baseColor) : baseColor;
        });
    }
}
