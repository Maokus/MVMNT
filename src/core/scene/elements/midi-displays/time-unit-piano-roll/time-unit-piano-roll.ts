// TimeUnitPianoRoll scene element with Property Binding System
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema, type PropertyDefinition } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { Line, Text, RenderObject, Rectangle, GlowLayer } from '@core/render/render-objects';
import { AnimationController } from './animation-controller';
import { getAnimationSelectOptions } from '@core/scene/elements/midi-displays/note-animations';
import { NoteBlock } from './note-block';
import { TimingManager } from '@core/timing/timing-manager';
import { getPluginHostApi, PLUGIN_CAPABILITIES, noteName } from '@mvmnt/plugin-sdk';
import { debugLog } from '@utils/debug-log';
import { normalizeColorAlphaValue, ensureEightDigitHex } from '@utils/color';
import { insertElementGroups, prop } from '@core/scene/plugins/plugin-sdk-prop-factories';

const DEFAULT_ROLL_WIDTH = 800;
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

export class TimeUnitPianoRollElement extends SceneElement {
    public timingManager: TimingManager;
    public animationController: AnimationController;
    // (Min BBox cache removed; layout stabilizes via includeInLayoutBounds)
    // Phase 3 reference pattern: intentionally consume timeline data through the public plugin API.

    constructor(id: string = 'timeUnitPianoRoll', config: { [key: string]: any } = {}) {
        super('timeUnitPianoRoll', id, config);

        // Initialize per-element TimingManager for beat grid / window calculations
        this.timingManager = new TimingManager(this.id);

        // Initialize animation controller
        this.animationController = new AnimationController(this);

        // midiFile handling removed; timeline tracks only
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
            name: 'Time Unit Piano Roll',
            description: 'Piano roll visualization split into time-aligned windows.',
            category: 'MIDI Displays',
        }, [
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Choose which MIDI track drives the piano roll.',
                    properties: [
                        prop.midiTrack('midiTrackId', 'MIDI Track', {
                            description: 'Pick a track from the current timeline session.',
                        }),
                    ],
                    presets: [
                        { id: 'leadTrack', label: 'Lead Track', values: {} },
                        { id: 'accompaniment', label: 'Accompaniment', values: {} },
                    ],
                },
                {
                    id: 'dimensions',
                    label: 'Layout & Range',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Configure viewport width, time window, and pitch range.',
                    properties: [
                        prop.number('rollWidth', 'Roll Width (px)', DEFAULT_ROLL_WIDTH, {
                            step: 50,
                            description: 'Width of the scrolling window in pixels.',
                        }),
                        prop.number('timeUnitBars', 'Time Unit (bars)', 1, { min: 1, max: 8, step: 1 }),
                        prop.number('minNote', 'Minimum MIDI Note', 30, { min: 0, max: 127, step: 1 }),
                        prop.number('maxNote', 'Maximum MIDI Note', 72, { min: 0, max: 127, step: 1 }),
                    ],
                    presets: [
                        {
                            id: 'wideStage',
                            label: 'Wide Stage',
                            values: { rollWidth: 1200, timeUnitBars: 2, minNote: 24, maxNote: 96 },
                        },
                        {
                            id: 'compactLead',
                            label: 'Compact Lead',
                            values: { rollWidth: 720, timeUnitBars: 1, minNote: 48, maxNote: 84 },
                        },
                        {
                            id: 'fullRange',
                            label: 'Full Range',
                            values: { rollWidth: 1400, timeUnitBars: 4, minNote: 21, maxNote: 108 },
                        },
                    ],
                },
                {
                    id: 'notes',
                    label: 'Notes',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Control how note blocks render within the window.',
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
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.number('noteCornerRadius', 'Note Corner Radius (px)', 2, {
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
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        }),
                        prop.number('noteGlowBlur', 'Note Glow Blur (px)', 0, {
                            step: 1,
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
                    id: 'noteGrid',
                    label: 'Note Grid',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Horizontal grid lines for pitch reference.',
                    properties: [
                        prop.boolean('showNoteGrid', 'Show Note Grid', true),
                        prop.color('noteGridColor', 'Grid Line Color', '#333333', {
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        }),
                        prop.number('noteGridLineWidth', 'Grid Line Width (px)', 1, {
                            min: 0.5, max: 10, step: 0.5,
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        }),
                        prop.number('noteGridOpacity', 'Grid Opacity', 1, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'brightGuides',
                            label: 'Bright Guides',
                            values: {
                                showNoteGrid: true,
                                noteGridColor: '#64748b',
                                noteGridOpacity: 0.8,
                                noteGridLineWidth: 1,
                            },
                        },
                        {
                            id: 'subtle',
                            label: 'Subtle Lines',
                            values: {
                                showNoteGrid: true,
                                noteGridColor: '#1f2937',
                                noteGridOpacity: 0.4,
                                noteGridLineWidth: 0.5,
                            },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showNoteGrid: false } },
                    ],
                },
                {
                    id: 'beatGrid',
                    label: 'Beat Grid',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Vertical grid lines for beats and bars.',
                    properties: [
                        prop.boolean('showBeatGrid', 'Show Beat Grid', true),
                        prop.color('beatGridBarColor', 'Bar Line Color', '#666666', {
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        }),
                        prop.color('beatGridBeatColor', 'Beat Line Color', '#444444', {
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        }),
                        prop.number('beatGridBarWidth', 'Bar Line Width (px)', 2, {
                            min: 0.5, max: 10, step: 0.5,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        }),
                        prop.number('beatGridBeatWidth', 'Beat Line Width (px)', 1, {
                            min: 0.5, max: 10, step: 0.5,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        }),
                        prop.number('beatGridOpacity', 'Grid Opacity', 1, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'barsAndBeats',
                            label: 'Bars & Beats',
                            values: {
                                showBeatGrid: true,
                                beatGridBarWidth: 2,
                                beatGridBeatWidth: 1,
                                beatGridOpacity: 0.9,
                            },
                        },
                        {
                            id: 'minimal',
                            label: 'Minimal Bars',
                            values: { showBeatGrid: true, beatGridBeatWidth: 0.5, beatGridOpacity: 0.4 },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showBeatGrid: false } },
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
                        { id: 'hidden', label: 'No Keyboard', values: { showPiano: false } },
                    ],
                },
                {
                    id: 'noteLabels',
                    label: 'Note Labels',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Configure note name overlays along the piano.',
                    properties: [
                        prop.boolean('showNoteLabels', 'Show Note Labels', true),
                        prop.font('noteLabelFontFamily', 'Font Family', 'Inter', {
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelFontSize', 'Font Size (px)', 10, {
                            min: 6, max: 32, step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.color('noteLabelFontColor', 'Font Color', '#ffffff', {
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelInterval', 'Label Interval', 1, {
                            min: 1, max: 24, step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelStartNote', 'Label Start Note', 0, {
                            min: 0, max: 127, step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelOffsetX', 'Offset X (px)', -10, {
                            min: -200, max: 200, step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelOffsetY', 'Offset Y (px)', 0, {
                            min: -200, max: 200, step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                        prop.number('noteLabelOpacity', 'Label Opacity', 1, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'everyNote',
                            label: 'Every Note',
                            values: { showNoteLabels: true, noteLabelInterval: 1, noteLabelOpacity: 1 },
                        },
                        {
                            id: 'octaves',
                            label: 'Octaves Only',
                            values: { showNoteLabels: true, noteLabelInterval: 12, noteLabelOpacity: 0.85 },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showNoteLabels: false } },
                    ],
                },
                {
                    id: 'beatLabels',
                    label: 'Beat & Bar Labels',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Configure beat/bar text above the grid.',
                    properties: [
                        prop.boolean('showBeatLabels', 'Show Beat Labels', true),
                        prop.font('beatLabelFontFamily', 'Font Family', 'Inter', {
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                        prop.number('beatLabelFontSize', 'Font Size (px)', 12, {
                            min: 6, max: 48, step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                        prop.color('beatLabelFontColor', 'Font Color', '#ffffff', {
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                        prop.number('beatLabelOffsetY', 'Offset Y (px)', -5, {
                            min: -200, max: 200, step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                        prop.number('beatLabelOffsetX', 'Offset X (px)', 5, {
                            min: -200, max: 200, step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                        prop.number('beatLabelOpacity', 'Label Opacity', 1, {
                            min: 0, max: 1, step: 0.05,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        }),
                    ],
                    presets: [
                        {
                            id: 'beatsAndBars',
                            label: 'Beats & Bars',
                            values: { showBeatLabels: true, beatLabelOpacity: 1 },
                        },
                        {
                            id: 'barsOnly',
                            label: 'Bars Only',
                            values: { showBeatLabels: true, beatLabelOpacity: 0.8, beatLabelFontSize: 14 },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showBeatLabels: false } },
                    ],
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Choose how notes animate when they enter or exit the window.',
                    properties: [
                        prop.select('animationType', 'Animation Type', 'expand', [
                            ...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' },
                        ]),
                        prop.number('attackDuration', 'Attack Duration (s)', 0.3, { step: 0.05 }),
                        prop.number('decayDuration', 'Decay Duration (s)', 0.3, { step: 0.05 }),
                        prop.number('releaseDuration', 'Release Duration (s)', 0.3, { step: 0.05 }),
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

        // timeOffset removed; targetTime used directly
        const effectiveTime = targetTime;
        const timeUnitBars = Math.max(1, Math.round(props.timeUnitBars ?? 1));
        const showPiano = props.showPiano ?? false;
        const pianoWidth = showPiano ? Math.max(0, props.pianoWidth ?? 0) : 0;
        const rollWidth = Math.max(0, props.rollWidth ?? DEFAULT_ROLL_WIDTH);
        const effectiveRollWidth = rollWidth;
        const showNoteGrid = props.showNoteGrid ?? true;
        const showNoteLabels = props.showNoteLabels ?? true;
        const showNotes = props.showNotes ?? true;
        const minNote = Math.max(0, Math.min(127, Math.floor(props.minNote ?? 30)));
        const maxNote = Math.max(0, Math.min(127, Math.floor(props.maxNote ?? 72)));
        const showBeatGrid = props.showBeatGrid ?? true;
        const showBeatLabels = props.showBeatLabels ?? true;
        const noteHeight = Math.max(4, Math.min(40, props.noteHeight ?? 20));
        const showPlayhead = props.showPlayhead ?? true;
        const playheadLineWidth = Math.max(0, props.playheadLineWidth ?? 2);
        const playheadColor = props.playheadColor ?? '#ff6b6b';
        const whiteKeyColor = props.whiteKeyColor ?? '#f0f0f0';
        const blackKeyColor = props.blackKeyColor ?? '#555555';
        const pianoOpacity = Math.max(0, Math.min(1, props.pianoOpacity ?? 1));
        const pianoRightBorderColor = props.pianoRightBorderColor ?? '#333333';
        const pianoRightBorderWidth = Math.max(0, props.pianoRightBorderWidth ?? 2);
        const noteGridColor = props.noteGridColor ?? '#333333';
        const noteGridLineWidth = Math.max(0, props.noteGridLineWidth ?? 1);
        const noteGridOpacity = Math.max(0, Math.min(1, props.noteGridOpacity ?? 1));
        const beatGridBarColor = props.beatGridBarColor ?? '#666666';
        const beatGridBeatColor = props.beatGridBeatColor ?? '#444444';
        const beatGridBarWidth = Math.max(0, props.beatGridBarWidth ?? 2);
        const beatGridBeatWidth = Math.max(0, props.beatGridBeatWidth ?? 1);
        const beatGridOpacity = Math.max(0, Math.min(1, props.beatGridOpacity ?? 1));
        const noteLabelFontSelection = props.noteLabelFontFamily ?? 'Inter';
        const { family: noteLabelFontFamily, weight: noteLabelFontWeightPart } =
            parseFontSelection(noteLabelFontSelection as string);
        const noteLabelFontSize = props.noteLabelFontSize ?? 10;
        const noteLabelFontColor = props.noteLabelFontColor ?? '#ffffff';
        const noteLabelFontWeight = (noteLabelFontWeightPart || '400').toString();
        const noteLabelInterval = Math.max(1, Math.round(props.noteLabelInterval ?? 1));
        const noteLabelStartNote = props.noteLabelStartNote ?? 0;
        const noteLabelOffsetX = props.noteLabelOffsetX ?? -10;
        const noteLabelOffsetY = props.noteLabelOffsetY ?? 0;
        const noteLabelOpacity = Math.max(0, Math.min(1, props.noteLabelOpacity ?? 1));
        const beatLabelFontSelection = props.beatLabelFontFamily ?? 'Inter';
        const { family: beatLabelFontFamily, weight: beatLabelFontWeightPart } =
            parseFontSelection(beatLabelFontSelection as string);
        const beatLabelFontSize = props.beatLabelFontSize ?? 12;
        const beatLabelFontColor = props.beatLabelFontColor ?? '#ffffff';
        const beatLabelFontWeight = (beatLabelFontWeightPart || '400').toString();
        const beatLabelOffsetY = props.beatLabelOffsetY ?? -5;
        const beatLabelOffsetX = props.beatLabelOffsetX ?? 5;
        const beatLabelOpacity = Math.max(0, Math.min(1, props.beatLabelOpacity ?? 1));
        const attackDuration = Math.max(0, props.attackDuration ?? 0.3);
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        const timelineState = status === 'ok' ? api?.timeline.getStateSnapshot() : null;
        if (noteLabelFontFamily) ensureFontLoaded(noteLabelFontFamily, noteLabelFontWeight);
        if (beatLabelFontFamily) ensureFontLoaded(beatLabelFontFamily, beatLabelFontWeight);

        // midiFile handling removed; use timeline tracks only

        // Update timing from global timeline snapshot
        try {
            const bpm = timelineState?.timeline.globalBpm || 120;
            const beatsPerBar = timelineState?.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            if (timelineState?.timeline.masterTempoMap && timelineState.timeline.masterTempoMap.length > 0) {
                this.timingManager.setTempoMap(timelineState.timeline.masterTempoMap, 'seconds');
            } else {
                this.timingManager.setTempoMap(null);
            }
        } catch {}

        // Compute overall content extents (for layout bounds and optional backgrounds)
        const totalHeight = (maxNote - minNote + 1) * noteHeight;
        const totalWidth = (showPiano ? pianoWidth : 0) + effectiveRollWidth;

        // Add an invisible rectangle that establishes the layout bounds to roughly cover the content area
        // This prevents jitter when other decorative elements toggle or animations change.
        const layoutBoundsRect = new Rectangle(0, 0, totalWidth, totalHeight, null, null, 0);
        (layoutBoundsRect as any).setIncludeInLayoutBounds?.(true);
        // No fill/stroke, so it's not drawn, but it contributes to layout bounds via getBounds().
        renderObjects.push(layoutBoundsRect);

        // Optionally draw the piano strip background first so notes/grids render on top
        if (showPiano) {
            for (let n = maxNote, i = 0; n >= minNote; n--, i++) {
                const y = i * noteHeight;
                const pc = n % 12;
                const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
                const col = isBlack ? blackKeyColor : whiteKeyColor;
                const key = new Rectangle(0, y, pianoWidth, noteHeight, col, null, 0);
                key.setOpacity?.(pianoOpacity);
                renderObjects.push(key);
            }
            if ((pianoRightBorderWidth || 0) > 0) {
                renderObjects.push(
                    new Line(
                        pianoWidth,
                        0,
                        pianoWidth,
                        (maxNote - minNote + 1) * noteHeight,
                        pianoRightBorderColor,
                        pianoRightBorderWidth
                    )
                );
            }
        }

        // Build source notes from timeline tracks only
        let sourceNotes: Array<{
            note: number;
            channel: number;
            velocity: number;
            startTime: number;
            endTime: number;
            startBeat?: number;
            endBeat?: number;
        }> = [];
        try {
            const trackId = props.midiTrackId;
            const effectiveTrackIds = trackId ? [trackId as string] : [];
            if (effectiveTrackIds.length > 0) {
                // Query two-window span (prev + current) so release animation frames still have note segments
                const currentWin = this.timingManager.getTimeUnitWindow(effectiveTime, timeUnitBars);
                // Derive previous window start without accessing private TimingManager internals.
                const beatsPerBar = this.timingManager.beatsPerBar || 4;
                const bpm = this.timingManager.bpm || 120;
                const secondsPerBeat = 60 / bpm;
                const windowBeats = timeUnitBars * beatsPerBar;
                const windowDurationApprox = windowBeats * secondsPerBeat; // acceptable for release span query
                const prevStart = currentWin.start - windowDurationApprox;
                const queryStart = prevStart;
                const queryEnd = currentWin.end + attackDuration;
                const events = status === 'ok' && api
                    ? api.timeline.selectNotesInWindow({
                    trackIds: effectiveTrackIds,
                    startSec: queryStart,
                    endSec: queryEnd,
                })
                    : [];
                sourceNotes = events.map((e) => ({
                    note: e.note,
                    channel: e.channel,
                    velocity: e.velocity || 0,
                    startTime: e.startTime,
                    endTime: e.endTime,
                    startBeat: undefined,
                    endBeat: undefined,
                }));
            }
        } catch {}

        // Build clamped segments across prev/current/next windows for lifecycle-based rendering
        const windowedNoteBlocks: NoteBlock[] = NoteBlock.buildWindowedSegments(
            sourceNotes,
            this.timingManager,
            effectiveTime,
            timeUnitBars
        );

        // Create render objects for the piano roll
        debugLog(
            `[_buildRenderObjects] ${
                showNotes ? 'Rendering notes' : 'Skipping notes'
            } for target time ${targetTime} with ${windowedNoteBlocks.length} windowed note segments`
        );
        if (showNotes && windowedNoteBlocks.length > 0) {
            const noteBlocks = windowedNoteBlocks; // already NoteBlock instances with window metadata
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { noteHeight, minNote, maxNote, pianoWidth, rollWidth: effectiveRollWidth },
                noteBlocks,
                effectiveTime
            );
            // Apply note style customizations
            const noteCornerRadius = Math.max(0, props.noteCornerRadius ?? 0);
            const noteStrokeColor = props.noteStrokeColor ?? undefined;
            const noteStrokeWidth = Math.max(0, props.noteStrokeWidth ?? 0);
            const noteGlowBlur = Math.max(0, props.noteGlowBlur ?? 0);
            const noteGlowOpacity = Math.max(0, Math.min(1, props.noteGlowOpacity ?? 0.5));
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                // Animation-generated objects should not affect layout bounds
                (obj as any).setIncludeInLayoutBounds?.(false);
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0) {
                    obj.setCornerRadius(noteCornerRadius);
                }
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function') {
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
                }
            });
            debugLog(`[_buildRenderObjects] Created ${animatedRenderObjects.length} animated note blocks`);
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

        // Add grid lines
        if (showNoteGrid) {
            const noteLines = this._createNoteGridLines(minNote, maxNote, pianoWidth, effectiveRollWidth, noteHeight);
            noteLines.forEach((l: any) => {
                if (noteGridColor) l.setColor?.(noteGridColor);
                if (noteGridLineWidth) l.setLineWidth?.(noteGridLineWidth);
                l.setOpacity?.(noteGridOpacity);
            });
            renderObjects.push(...noteLines);
        }

        // Add beat grid (tempo-aware)
        if (showBeatGrid) {
            const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.timingManager.beatsPerBar || 4;
            const beatLines = this._createBeatGridLines(
                windowStart,
                windowEnd,
                beatsPerBarForGrid,
                pianoWidth,
                effectiveRollWidth,
                (maxNote - minNote + 1) * noteHeight
            );
            beatLines.forEach((l: any) => {
                const isBar = (l.lineWidth || 1) > 1; // heuristic from default creation
                const color = isBar ? beatGridBarColor : beatGridBeatColor;
                const width = isBar ? beatGridBarWidth : beatGridBeatWidth;
                l.setColor?.(color);
                l.setLineWidth?.(width);
                l.setOpacity?.(beatGridOpacity);
            });
            renderObjects.push(...beatLines);
        }

        // Add note labels
        if (showNoteLabels) {
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const labels = this._createNoteLabels(minNote, maxNote, effectivePianoWidth, noteHeight);
            let visibleIndex = 0;
            for (const lbl of labels as any[]) {
                // interval logic based solely on visibleIndex
                if ((visibleIndex - noteLabelStartNote) % noteLabelInterval !== 0) {
                    lbl.setOpacity?.(0); // hide
                } else {
                    lbl.text && (lbl.font = `${noteLabelFontWeight} ${noteLabelFontSize}px ${noteLabelFontFamily}`);
                    lbl.color = noteLabelFontColor;
                    lbl.setOpacity?.(noteLabelOpacity);
                    lbl.x = effectivePianoWidth + noteLabelOffsetX; // adjust relative to piano edge
                    lbl.y += noteLabelOffsetY;
                }
                visibleIndex++;
            }
            renderObjects.push(...labels);
        }

        // Add beat labels (tempo-aware)
        if (showBeatLabels) {
            const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.timingManager.beatsPerBar || 4;
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const labels = this._createBeatLabels(
                windowStart,
                windowEnd,
                beatsPerBarForGrid,
                pianoWidth,
                effectiveRollWidth
            );
            (labels as any[]).forEach((lbl) => {
                lbl.font = `${beatLabelFontWeight} ${beatLabelFontSize}px ${beatLabelFontFamily}`;
                lbl.color = beatLabelFontColor;
                lbl.x += beatLabelOffsetX;
                lbl.y += beatLabelOffsetY;
                lbl.setOpacity?.(beatLabelOpacity);
            });
            renderObjects.push(...labels);
        }

        // Add playhead
        if (showPlayhead) {
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const ph = this._createPlayhead(
                effectiveTime,
                pianoWidth,
                effectiveRollWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor as string
            );
            (ph as any[]).forEach((l) => {
                (l as any).setIncludeInLayoutBounds?.(false);
            });
            renderObjects.push(...ph);
        }

        // (Min BBox anchoring removed)

        return renderObjects;
    }

    // midi file support removed

    /**
     * Create horizontal note grid lines across the roll area
     */
    private _createNoteGridLines(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        rollWidth: number,
        noteHeight: number
    ): RenderObject[] {
        const lines: RenderObject[] = [];
        const x1 = pianoWidth;
        const x2 = pianoWidth + rollWidth;
        // draw line at each note boundary
        for (let i = 0; i <= maxNote - minNote; i++) {
            const y = i * noteHeight;
            const ln = new Line(x1, y, x2, y, '#333333', 1);
            (ln as any).setIncludeInLayoutBounds?.(false);
            lines.push(ln);
        }
        return lines;
    }

    /**
     * Create vertical beat and bar grid lines across the roll area
     */
    private _createBeatGridLines(
        windowStart: number,
        windowEnd: number,
        beatsPerBar: number,
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number
    ): RenderObject[] {
        const lines: RenderObject[] = [];
        const beats = this.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const isBar = !!b.isBarStart;
            const ln = new Line(x, 0, x, totalHeight, isBar ? '#666666' : '#444444', isBar ? 2 : 1);
            (ln as any).setIncludeInLayoutBounds?.(false);
            lines.push(ln);
        }
        return lines;
    }

    /**
     * Create note labels for each visible note row in the piano area
     */
    private _createNoteLabels(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        noteHeight: number
    ): RenderObject[] {
        const labels: RenderObject[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;
        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - (note - minNote + 0.5) * noteHeight;
            const noteLabel = noteName(note);
            const label = new Text(pianoWidth - 10, y, noteLabel, '10px Arial', '#ffffff', 'right', 'middle');
            (label as any).setIncludeInLayoutBounds?.(false);
            labels.push(label);
        }
        return labels;
    }

    /**
     * Create beat and bar labels
     */
    private _createBeatLabels(
        windowStart: number,
        windowEnd: number,
        beatsPerBar: number,
        pianoWidth: number,
        rollWidth: number
    ): RenderObject[] {
        const labels: RenderObject[] = [];
        const beats = this.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            if (!b.isBarStart) continue;
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const bar = b.barNumber;
            const label = new Text(x + 5, -5, `Bar ${bar}`, '12px Arial', '#ffffff', 'left', 'bottom');
            (label as any).setIncludeInLayoutBounds?.(false);
            labels.push(label);
        }

        return labels;
    }

    /**
     * Create playhead line
     */
    private _createPlayhead(
        targetTime: number,
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number,
        lineWidth: number,
        playheadColor: string
    ): RenderObject[] {
        const playheadObjects: RenderObject[] = [];

        // Calculate playhead position
        const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(
            targetTime,
            this.getTimeUnitBars()
        );
        const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);
        const playheadPosition = ((targetTime - windowStart) / timeUnitInSeconds) * rollWidth;
        const playheadX = pianoWidth + playheadPosition;

        // Create playhead line using Line.createPlayhead if available, otherwise use regular Line
        if (Line.createPlayhead) {
            const playhead = Line.createPlayhead(playheadX, 0, totalHeight, playheadColor, lineWidth);
            playheadObjects.push(playhead);
        } else {
            // Fallback to regular line
            const playhead = new Line(playheadX, 0, playheadX, totalHeight, playheadColor, lineWidth);
            playheadObjects.push(playhead);
        }

        return playheadObjects;
    }

    // (Removed min-bbox helpers)

    // Note name resolved using noteName() from @mvmnt/plugin-sdk

    /**
     * Dispatch a change event to trigger re-renders
     */
    private _dispatchChangeEvent(): void {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(
                new CustomEvent('sceneElementChanged', {
                    detail: { elementId: this.id },
                })
            );
        }
    }

    // Macro listener for midiFile removed

    // Ensure listeners are detached when element is disposed
    dispose(): void {
        super.dispose();
    }

    // Convenience methods for property access (timing-specific methods removed; global timeline used)

    // Public getters for animation properties (used by AnimationController)
    getAnimationType(): string {
        return (this.getSchemaProps().animationType as string | undefined) ?? 'expand';
    }

    // ADSR phase durations
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
        // Provide a tempo-aware duration of a bar group using default reference time
        return this.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }

    // Removed midiFile getters/setters

    // Binding-specific methods (timing macro binding removed)

    // Removed midiFile macro binding

    /**
     * Get channel colors for MIDI channels
     */
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
