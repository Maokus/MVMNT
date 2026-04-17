// MovingNotesPianoRoll scene element: static playhead, notes move across.
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema, type PropertyDefinition } from '@core/types.js';
import { Line, EmptyRenderObject, RenderObject, Rectangle, GlowLayer } from '@core/render/render-objects';
import { getAnimationSelectOptions } from '@core/scene/elements/midi-displays/note-animations';
import { normalizeColorAlphaValue, ensureEightDigitHex } from '@utils/color';
// Timeline-backed migration: remove per-element MidiManager usage
import { MovingNotesAnimationController } from './animation-controller';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { TimingManager } from '@core/timing';
import { insertElementGroups, prop } from '@core/scene/plugins/plugin-sdk-prop-factories';

const DEFAULT_NOTE_COLOR = '#FF6B6BCC';

const applyLegacyOpacity = (color: string, opacity?: number): string => {
    const sanitized = ensureEightDigitHex(color, DEFAULT_NOTE_COLOR);
    if (opacity === undefined || opacity === null) {
        return sanitized;
    }
    const clamped = Math.max(0, Math.min(1, opacity));
    const alphaHex = Math.round(clamped * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
    return `${sanitized.slice(0, 7)}${alphaHex}`;
};

export class MovingNotesPianoRollElement extends SceneElement {
    public animationController: MovingNotesAnimationController;
    private timingManager: TimingManager;
    // Phase 3 reference pattern: intentionally consume timeline data through the public plugin API.

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
        const channelColorPastel = [
            '#f9a8d4',
            '#fbcfe8',
            '#fde68a',
            '#a5f3fc',
            '#bfdbfe',
            '#c7d2fe',
            '#e9d5ff',
            '#fecdd3',
            '#fcd34d',
            '#bbf7d0',
            '#a7f3d0',
            '#d1fae5',
            '#f5d0fe',
            '#fbcfe8',
            '#e0f2fe',
            '#fee2e2',
        ];
        const channelColorHeatmap = [
            '#ef4444',
            '#f97316',
            '#f59e0b',
            '#eab308',
            '#84cc16',
            '#22c55e',
            '#14b8a6',
            '#0ea5e9',
            '#2563eb',
            '#4f46e5',
            '#7c3aed',
            '#a855f7',
            '#ec4899',
            '#f472b6',
            '#fb7185',
            '#f97316',
        ];
        const createChannelPreset = (colors: string[]) =>
            colors.reduce<Record<string, string>>((acc, color, index) => {
                acc[`channel${index}Color`] = color;
                return acc;
            }, {});
        const channelColorProperties: PropertyDefinition[] = Array.from({ length: 16 }, (_, i) =>
            prop.color(`channel${i}Color`, `Channel ${i + 1}`, channelColorDefaults[i], {
                visibleWhen: [
                    { key: 'showNotes', truthy: true },
                    { key: 'useChannelColors', truthy: true },
                ],
            })
        );

        return insertElementGroups(super.getConfigSchema(), {
            name: 'Moving Notes Piano Roll',
            description: 'Notes move past a static playhead',
            category: 'MIDI Displays',
        }, [
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Choose which MIDI track drives this piano roll.',
                    properties: [
                        prop.midiTrack('midiTrackId', 'MIDI Track', {
                            description: 'Legacy single-track selector used when no list is specified.',
                        }),
                    ],
                },
                {
                    id: 'dimensions',
                    label: 'Layout & Range',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Configure viewport width, time window, and pitch range.',
                    properties: [
                        prop.number('rollWidth', 'Roll Width (px)', 800, {
                            min: 100, max: 4000, step: 10,
                            description: 'Total width for the moving-notes viewport.',
                        }),
                        prop.number('timeUnitBars', 'Time Unit (bars)', 1, { min: 1, max: 8, step: 1 }),
                        prop.number('minNote', 'Minimum MIDI Note', 30, { min: 0, max: 127, step: 1 }),
                        prop.number('maxNote', 'Maximum MIDI Note', 72, { min: 0, max: 127, step: 1 }),
                    ],
                    presets: [
                        {
                            id: 'wideStage',
                            label: 'Wide Stage',
                            values: { pianoWidth: 140, rollWidth: 1200, timeUnitBars: 2, minNote: 24, maxNote: 84 },
                        },
                        {
                            id: 'compactKeys',
                            label: 'Compact Keys',
                            values: { pianoWidth: 100, rollWidth: 700, timeUnitBars: 1, minNote: 36, maxNote: 84 },
                        },
                        {
                            id: 'fullRange',
                            label: 'Full Range',
                            values: { pianoWidth: 120, rollWidth: 1400, timeUnitBars: 4, minNote: 21, maxNote: 108 },
                        },
                    ],
                },
                {
                    id: 'notes',
                    label: 'Notes',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Control how notes are drawn as they move past the playhead.',
                    properties: [
                        prop.boolean('showNotes', 'Show Notes', true),
                        prop.boolean('useChannelColors', 'Use Per-Channel Colors', false, {
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.colorAlpha('noteColor', 'Note Color', DEFAULT_NOTE_COLOR, {
                            visibleWhen: [
                                { key: 'showNotes', truthy: true },
                                { key: 'useChannelColors', falsy: true },
                            ],
                        }),
                        prop.number('noteHeight', 'Note Height (px)', 20, {
                            min: 4, max: 40, step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.number('noteCornerRadius', 'Note Corner Radius (px)', 2, {
                            min: 0, max: 20, step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.color('noteStrokeColor', 'Note Stroke Color', '#ffffff', {
                            visibleWhen: [{ key: 'showNotes', truthy: true }, { key: 'noteStrokeWidth', truthy: true }],
                        }),
                        prop.number('noteStrokeWidth', 'Note Stroke Width (px)', 0, {
                            min: 0, max: 10, step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.number('noteGlowBlur', 'Note Glow Blur (px)', 0, {
                            min: 0, max: 50, step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.number('noteGlowOpacity', 'Note Glow Opacity', 0.5, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        ...channelColorProperties,
                    ],
                    presets: [
                        {
                            id: 'classicBlocks',
                            label: 'Classic Blocks',
                            values: {
                                showNotes: true,
                                noteHeight: 20,
                                noteColor: '#FF6B6BD9',
                                noteGlowOpacity: 0.4,
                            },
                        },
                        {
                            id: 'ghosted',
                            label: 'Ghosted',
                            values: {
                                showNotes: true,
                                noteColor: '#FF6B6B80',
                                noteGlowOpacity: 0.2,
                                noteStrokeWidth: 1,
                            },
                        },
                        {
                            id: 'neon',
                            label: 'Neon',
                            values: {
                                showNotes: true,
                                noteColor: '#FF6B6BE6',
                                noteGlowOpacity: 0.7,
                                noteGlowBlur: 12,
                            },
                        },
                        {
                            id: 'perChannelRainbow',
                            label: 'Per-Channel Rainbow',
                            values: {
                                showNotes: true,
                                useChannelColors: true,
                                ...createChannelPreset(channelColorDefaults),
                            },
                        },
                        {
                            id: 'perChannelPastel',
                            label: 'Per-Channel Pastel',
                            values: {
                                showNotes: true,
                                useChannelColors: true,
                                ...createChannelPreset(channelColorPastel),
                            },
                        },
                        {
                            id: 'perChannelHeatMap',
                            label: 'Per-Channel Heat Map',
                            values: {
                                showNotes: true,
                                useChannelColors: true,
                                ...createChannelPreset(channelColorHeatmap),
                            },
                        },
                        {
                            id: 'singleColor',
                            label: 'Single Color',
                            values: {
                                showNotes: true,
                                useChannelColors: false,
                                noteColor: DEFAULT_NOTE_COLOR,
                            },
                        },
                    ],
                },
                {
                    id: 'piano',
                    label: 'Piano',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Optional static keyboard rendered alongside the roll.',
                    properties: [
                        prop.boolean('showPiano', 'Show Piano', false),
                        prop.number('pianoWidth', 'Piano Width (px)', 0, {
                            min: 80, max: 300, step: 10,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                        prop.color('whiteKeyColor', 'White Key Color', '#f0f0f0', {
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                        prop.color('blackKeyColor', 'Black Key Color', '#555555', {
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                        prop.number('pianoOpacity', 'Piano Opacity', 1, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                        prop.color('pianoRightBorderColor', 'Piano Right Border', '#333333', {
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                        prop.number('pianoRightBorderWidth', 'Piano Right Border Width (px)', 2, {
                            min: 0, max: 10, step: 1,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'classicPiano',
                            label: 'Classic Piano',
                            values: {
                                showPiano: true,
                                whiteKeyColor: '#f8fafc',
                                blackKeyColor: '#111827',
                                pianoOpacity: 1,
                            },
                        },
                        {
                            id: 'ghostKeys',
                            label: 'Ghost Keys',
                            values: {
                                showPiano: true,
                                whiteKeyColor: '#94a3b8',
                                blackKeyColor: '#1f2937',
                                pianoOpacity: 0.6,
                            },
                        },
                        { id: 'hiddenKeys', label: 'No Keyboard', values: { showPiano: false } },
                    ],
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Choose how notes animate when triggered.',
                    properties: [
                        prop.select('animationType', 'Animation Type', 'expand', [
                            ...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' },
                        ]),
                        prop.number('attackDuration', 'Attack Duration (s)', 0.3, { min: 0, max: 10, step: 0.05 }),
                        prop.number('decayDuration', 'Decay Duration (s)', 0.3, { min: 0, max: 10, step: 0.05 }),
                        prop.number('releaseDuration', 'Release Duration (s)', 0.3, { min: 0, max: 10, step: 0.05 }),
                        prop.number('playheadPosition', 'Playhead Position (0–1)', 0.5, { min: 0, max: 1, step: 0.01 }),
                        prop.number('playheadOffset', 'Playhead Offset (px)', 0, {
                            min: -4000, max: 4000, step: 1,
                            description: 'Pixel offset added to playhead position within the element width.',
                        }),
                    ],
                    presets: [
                        {
                            id: 'expand',
                            label: 'Expand',
                            values: {
                                animationType: 'expand',
                                attackDuration: 0.3,
                                decayDuration: 0.3,
                                releaseDuration: 0.3,
                            },
                        },
                        {
                            id: 'staccato',
                            label: 'Staccato',
                            values: {
                                animationType: 'expand',
                                attackDuration: 0.1,
                                decayDuration: 0.15,
                                releaseDuration: 0.2,
                            },
                        },
                        {
                            id: 'noAnimation',
                            label: 'No Animation',
                            values: { animationType: 'none', attackDuration: 0, decayDuration: 0, releaseDuration: 0 },
                        },
                    ],
                },
                {
                    id: 'playhead',
                    label: 'Playhead',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Style the static playhead indicator.',
                    properties: [
                        prop.boolean('showPlayhead', 'Show Playhead', true),
                        prop.colorAlpha('playheadColor', 'Playhead Color', '#ff6b6bff', {
                            visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                        }),
                        prop.number('playheadLineWidth', 'Playhead Line Width (px)', 2, {
                            min: 1, max: 10, step: 1,
                            visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'standard',
                            label: 'Standard',
                            values: {
                                showPlayhead: true,
                                playheadColor: '#ff6b6b',
                                playheadLineWidth: 2,
                            },
                        },
                        {
                            id: 'thin',
                            label: 'Thin Line',
                            values: {
                                showPlayhead: true,
                                playheadLineWidth: 1,
                                playheadColor: '#f8fafc',
                            },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showPlayhead: false } },
                    ],
                },
        ]);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const renderObjects: RenderObject[] = [];
        // Use global timeline tempo and meter
        // timeOffset removed; use targetTime directly
        const effectiveTime = targetTime;
        const timeUnitBars = Math.max(1, Math.round(props.timeUnitBars ?? 1));
        const pianoWidth = Math.max(0, props.pianoWidth ?? 0);
        const rollWidth = Math.max(0, props.rollWidth ?? 0);
        const showNotes = props.showNotes ?? true;
        const minNote = Math.max(0, Math.min(127, Math.floor(props.minNote ?? 30)));
        const maxNote = Math.max(0, Math.min(127, Math.floor(props.maxNote ?? 72)));
        const noteHeight = Math.max(4, Math.min(40, props.noteHeight ?? 20));
        const showPlayhead = props.showPlayhead ?? true;
        const playheadLineWidth = Math.max(0, props.playheadLineWidth ?? 2);
        const playheadColor = props.playheadColor ?? '#ff6b6b';
        const playheadPosition = Math.max(0, Math.min(1, props.playheadPosition ?? 0.25));
        const playheadOffset = props.playheadOffset ?? 0;
        const showPiano = props.showPiano ?? false;
        const whiteKeyColor = props.whiteKeyColor ?? '#f0f0f0';
        const blackKeyColor = props.blackKeyColor ?? '#555555';
        const pianoOpacity = Math.max(0, Math.min(1, props.pianoOpacity ?? 1));
        const pianoRightBorderColor = props.pianoRightBorderColor ?? '#333333';
        const pianoRightBorderWidth = Math.max(0, props.pianoRightBorderWidth ?? 2);
        const effectivePianoWidth = showPiano ? pianoWidth : 0; // mirror TimeUnit roll layout behavior
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        const timelineState = status === 'ok' ? api?.timeline.getStateSnapshot() : null;

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
                const key = new Rectangle(0, y, pianoWidth, noteHeight, col, null, 0);
                key.setOpacity?.(pianoOpacity);
                renderObjects.push(key);
            }
            // Right border to separate piano from roll area
            if ((pianoRightBorderWidth || 0) > 0) {
                const border = new Line(
                    pianoWidth,
                    0,
                    pianoWidth,
                    (maxNote - minNote + 1) * noteHeight,
                    pianoRightBorderColor as string,
                    pianoRightBorderWidth
                );
                renderObjects.push(border);
            }
        }

        // Determine window around current time
        const duration = this.timingManager.getTimeUnitDuration(timeUnitBars);
        const windowStart = effectiveTime - duration * playheadPosition;
        const windowEnd = windowStart + duration;

        // Fetch notes for this window from public plugin host API
        const rawNotes =
            props.midiTrackId && status === 'ok' && api
                ? api.timeline.selectNotesInWindow({
                      trackIds: [props.midiTrackId as string],
                      startSec: windowStart,
                      endSec: windowEnd,
                  }).map((n) => ({
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
            const noteCornerRadius = Math.max(0, props.noteCornerRadius ?? 2);
            const noteStrokeColor = props.noteStrokeColor;
            const noteStrokeWidth = Math.max(0, props.noteStrokeWidth ?? 0);
            const noteGlowBlur = Math.max(0, props.noteGlowBlur ?? 0);
            const noteGlowOpacity = Math.max(0, Math.min(1, props.noteGlowOpacity ?? 0.5));
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
            const layoutRect = new Rectangle(0, 0, effectivePianoWidth + rollWidth, totalHeight, null, null, 0);
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
            : new Line(x, 0, x, totalHeight, playheadColor, lineWidth);
        return [playhead];
    }

    // Convenience getters/setters removed: element uses global tempo/meter from store
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

    // Macro bindings for bpm/beat removed
    getChannelColors(): string[] {
        const props = this.getSchemaProps();
        const rawBaseColor = (props.noteColor ?? props.channel0Color ?? DEFAULT_NOTE_COLOR) as string;
        const baseColor = normalizeColorAlphaValue(rawBaseColor, DEFAULT_NOTE_COLOR);
        if (!props.useChannelColors) {
            return Array.from({ length: 16 }, () => baseColor);
        }

        return Array.from({ length: 16 }, (_, index) => {
            const rawChannelColor = (props[`channel${index}Color`] as string | undefined) ?? baseColor;
            return normalizeColorAlphaValue(rawChannelColor, baseColor);
        });
    }
}
