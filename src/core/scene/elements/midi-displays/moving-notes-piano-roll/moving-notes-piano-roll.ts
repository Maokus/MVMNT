// MovingNotesPianoRoll scene element: static playhead, notes move across.
import { SceneElement, asBoolean, asNumber, asTrimmedString, type PropertyDescriptor } from '@core/scene/elements/base';
import { EnhancedConfigSchema, type PropertyDefinition } from '@core/types.js';
import { Line, EmptyRenderObject, RenderObject, Rectangle } from '@core/render/render-objects';
import { getAnimationSelectOptions } from '@animation/note-animations';
import { normalizeColorAlphaValue, ensureEightDigitHex } from '@utils/color';
// Timeline-backed migration: remove per-element MidiManager usage
import { MovingNotesAnimationController } from './animation-controller';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';
import { TimingManager } from '@core/timing';

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
    // TimelineService removed; use store selectors for MIDI retrieval

    constructor(id: string = 'movingNotesPianoRoll', config: { [key: string]: any } = {}) {
        super('movingNotesPianoRoll', id, config);
        this.animationController = new MovingNotesAnimationController(this);
        this.timingManager = new TimingManager(this.id);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
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
        const channelColorProperties: PropertyDefinition[] = Array.from({ length: 16 }, (_, i) => ({
            key: `channel${i}Color`,
            type: 'color',
            label: `Channel ${i + 1}`,
            default: channelColorDefaults[i],
            visibleWhen: [
                { key: 'showNotes', truthy: true },
                { key: 'useChannelColors', truthy: true },
            ],
        }));

        return {
            name: 'Moving Notes Piano Roll',
            description: 'Notes move past a static playhead',
            category: 'MIDI Displays',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Choose which MIDI data feeds the piano roll.',
                    properties: [
                        {
                            key: 'midiTrackIds',
                            type: 'timelineTrackRef',
                            label: 'MIDI Tracks',
                            default: [],
                            allowMultiple: true,
                            description: 'Optional multi-track selection for blending MIDI sources.',
                        },
                        { key: 'midiTrackId', type: 'timelineTrackRef', label: 'MIDI Track', default: null },
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
                    description: 'Set viewport width, duration, and pitch range.',
                    properties: [
                        {
                            key: 'pianoWidth',
                            type: 'number',
                            label: 'Piano Width (px)',
                            default: 0,
                            min: 80,
                            max: 300,
                            step: 10,
                        },
                        {
                            key: 'rollWidth',
                            type: 'number',
                            label: 'Legacy Roll Width (px)',
                            default: 800,
                            min: 200,
                            max: 2000,
                            step: 50,
                            description: 'Deprecated value (use Element Width instead).',
                        },
                        {
                            key: 'elementWidth',
                            type: 'number',
                            label: 'Element Width (px)',
                            default: 800,
                            min: 100,
                            max: 4000,
                            step: 10,
                            description: 'Total width for the moving-notes viewport.',
                        },
                        {
                            key: 'timeUnitBars',
                            type: 'number',
                            label: 'Time Unit (bars)',
                            default: 1,
                            min: 1,
                            max: 8,
                            step: 1,
                        },
                        {
                            key: 'minNote',
                            type: 'number',
                            label: 'Minimum MIDI Note',
                            default: 30,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                        {
                            key: 'maxNote',
                            type: 'number',
                            label: 'Maximum MIDI Note',
                            default: 72,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                    ],
                    presets: [
                        {
                            id: 'wideStage',
                            label: 'Wide Stage',
                            values: { pianoWidth: 140, elementWidth: 1200, timeUnitBars: 2, minNote: 24, maxNote: 84 },
                        },
                        {
                            id: 'compactKeys',
                            label: 'Compact Keys',
                            values: { pianoWidth: 100, elementWidth: 700, timeUnitBars: 1, minNote: 36, maxNote: 84 },
                        },
                        {
                            id: 'fullRange',
                            label: 'Full Range',
                            values: { pianoWidth: 120, elementWidth: 1400, timeUnitBars: 4, minNote: 21, maxNote: 108 },
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
                        { key: 'showNotes', type: 'boolean', label: 'Show Notes', default: true },
                        {
                            key: 'useChannelColors',
                            type: 'boolean',
                            label: 'Use Per-Channel Colors',
                            default: false,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteColor',
                            type: 'colorAlpha',
                            label: 'Note Color',
                            default: DEFAULT_NOTE_COLOR,
                            visibleWhen: [
                                { key: 'showNotes', truthy: true },
                                { key: 'useChannelColors', falsy: true },
                            ],
                        },
                        {
                            key: 'noteHeight',
                            type: 'number',
                            label: 'Note Height (px)',
                            default: 20,
                            min: 4,
                            max: 40,
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteCornerRadius',
                            type: 'number',
                            label: 'Note Corner Radius (px)',
                            default: 2,
                            min: 0,
                            max: 20,
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteStrokeColor',
                            type: 'color',
                            label: 'Note Stroke Color',
                            default: '#ffffff',
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteStrokeWidth',
                            type: 'number',
                            label: 'Note Stroke Width (px)',
                            default: 0,
                            min: 0,
                            max: 10,
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteGlowColor',
                            type: 'color',
                            label: 'Note Glow Color',
                            default: 'rgba(255,255,255,0.5)',
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteGlowBlur',
                            type: 'number',
                            label: 'Note Glow Blur (px)',
                            default: 0,
                            min: 0,
                            max: 50,
                            step: 1,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
                        {
                            key: 'noteGlowOpacity',
                            type: 'number',
                            label: 'Note Glow Opacity',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showNotes', truthy: true }],
                        },
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
                                noteGlowColor: 'rgba(56,189,248,0.7)',
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
                        { key: 'showPiano', type: 'boolean', label: 'Show Piano', default: false },
                        {
                            key: 'whiteKeyColor',
                            type: 'color',
                            label: 'White Key Color',
                            default: '#f0f0f0',
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
                        {
                            key: 'blackKeyColor',
                            type: 'color',
                            label: 'Black Key Color',
                            default: '#555555',
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
                        {
                            key: 'pianoOpacity',
                            type: 'number',
                            label: 'Piano Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
                        {
                            key: 'pianoRightBorderColor',
                            type: 'color',
                            label: 'Piano Right Border',
                            default: '#333333',
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
                        {
                            key: 'pianoRightBorderWidth',
                            type: 'number',
                            label: 'Piano Right Border Width (px)',
                            default: 2,
                            min: 0,
                            max: 10,
                            step: 1,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
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
                    id: 'noteColors',
                    label: 'Per-Channel Colors',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Assign colors for each MIDI channel.',
                    properties: Array.from({ length: 16 }).map((_, i) => ({
                        key: `channel${i}Color`,
                        type: 'color',
                        label: `Channel ${i + 1}`,
                        default: channelColorDefaults[i],
                    })),
                    presets: [
                        { id: 'rainbow', label: 'Rainbow', values: createChannelPreset(channelColorDefaults) },
                        { id: 'pastel', label: 'Pastel', values: createChannelPreset(channelColorPastel) },
                        { id: 'heatmap', label: 'Heat Map', values: createChannelPreset(channelColorHeatmap) },
                        { id: 'mono', label: 'Monochrome', values: createChannelPreset(Array(16).fill('#f8fafc')) },
                    ],
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Choose how notes animate when triggered.',
                    properties: [
                        {
                            key: 'animationType',
                            type: 'select',
                            label: 'Animation Type',
                            default: 'expand',
                            options: [...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' }],
                        },
                        {
                            key: 'attackDuration',
                            type: 'number',
                            label: 'Attack Duration (s)',
                            default: 0.3,
                            min: 0,
                            max: 10,
                            step: 0.05,
                        },
                        {
                            key: 'decayDuration',
                            type: 'number',
                            label: 'Decay Duration (s)',
                            default: 0.3,
                            min: 0,
                            max: 10,
                            step: 0.05,
                        },
                        {
                            key: 'releaseDuration',
                            type: 'number',
                            label: 'Release Duration (s)',
                            default: 0.3,
                            min: 0,
                            max: 10,
                            step: 0.05,
                        },
                        {
                            key: 'playheadPosition',
                            type: 'number',
                            label: 'Playhead Position (0–1)',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.01,
                        },
                        {
                            key: 'playheadOffset',
                            type: 'number',
                            label: 'Playhead Offset (px)',
                            default: 0,
                            min: -4000,
                            max: 4000,
                            step: 1,
                            description: 'Pixel offset added to playhead position within the element width.',
                        },
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
                        { key: 'showPlayhead', type: 'boolean', label: 'Show Playhead', default: true },
                        {
                            key: 'playheadColor',
                            type: 'color',
                            label: 'Playhead Color',
                            default: '#ff6b6b',
                            visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                        },
                        {
                            key: 'playheadLineWidth',
                            type: 'number',
                            label: 'Playhead Line Width (px)',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 1,
                            visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                        },
                        {
                            key: 'playheadOpacity',
                            type: 'number',
                            label: 'Playhead Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showPlayhead', truthy: true }],
                        },
                    ],
                    presets: [
                        {
                            id: 'standard',
                            label: 'Standard',
                            values: {
                                showPlayhead: true,
                                playheadColor: '#ff6b6b',
                                playheadLineWidth: 2,
                                playheadOpacity: 1,
                            },
                        },
                        {
                            id: 'thin',
                            label: 'Thin Line',
                            values: {
                                showPlayhead: true,
                                playheadLineWidth: 1,
                                playheadOpacity: 0.8,
                                playheadColor: '#f8fafc',
                            },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showPlayhead: false } },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }
    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps({
            timeUnitBars: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(1, Math.round(numeric));
                },
                defaultValue: 1,
            },
            pianoWidth: { transform: asNumber, defaultValue: 0 },
            rollWidth: { transform: asNumber, defaultValue: 800 },
            elementWidth: { transform: asNumber },
            showNotes: { transform: asBoolean, defaultValue: true },
            minNote: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    if (numeric === undefined) return undefined;
                    return Math.max(0, Math.min(127, Math.floor(numeric)));
                },
                defaultValue: 30,
            },
            maxNote: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    if (numeric === undefined) return undefined;
                    return Math.max(0, Math.min(127, Math.floor(numeric)));
                },
                defaultValue: 72,
            },
            noteHeight: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    if (numeric === undefined) return undefined;
                    return Math.max(4, Math.min(40, numeric));
                },
                defaultValue: 20,
            },
            showPlayhead: { transform: asBoolean, defaultValue: true },
            playheadLineWidth: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 2,
            },
            playheadColor: { transform: asTrimmedString, defaultValue: '#ff6b6b' },
            playheadOpacity: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: 1,
            },
            playheadPosition: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: 0.25,
            },
            playheadOffset: { transform: asNumber, defaultValue: 0 },
            showPiano: { transform: asBoolean, defaultValue: false },
            whiteKeyColor: { transform: asTrimmedString, defaultValue: '#f0f0f0' },
            blackKeyColor: { transform: asTrimmedString, defaultValue: '#555555' },
            pianoOpacity: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: 1,
            },
            pianoRightBorderColor: { transform: asTrimmedString, defaultValue: '#333333' },
            pianoRightBorderWidth: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 2,
            },
            midiTrackIds: {
                transform: (value) => {
                    if (!Array.isArray(value)) return undefined;
                    return value
                        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                        .filter((entry) => entry.length > 0);
                },
                defaultValue: [] as string[],
            },
            midiTrackId: {
                transform: (value, element) => asTrimmedString(value, element) ?? null,
                defaultValue: null,
            },
            noteOpacity: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: undefined,
            },
            noteCornerRadius: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 2,
            },
            noteStrokeColor: { transform: asTrimmedString, defaultValue: '#ffffff' },
            noteStrokeWidth: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 0,
            },
            noteGlowColor: { transform: asTrimmedString, defaultValue: 'rgba(255,255,255,0.5)' },
            noteGlowBlur: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 0,
            },
            noteGlowOpacity: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: 0.5,
            },
        });

        const renderObjects: RenderObject[] = [];
        // Use global timeline tempo and meter
        // timeOffset removed; use targetTime directly
        const effectiveTime = targetTime;
        const timeUnitBars = props.timeUnitBars;
        const pianoWidth = props.pianoWidth;
        const rollWidth = props.rollWidth;
        const elementWidth = props.elementWidth ?? rollWidth;
        const showNotes = props.showNotes;
        const minNote = props.minNote;
        const maxNote = props.maxNote;
        const noteHeight = props.noteHeight;
        const showPlayhead = props.showPlayhead;
        const playheadLineWidth = props.playheadLineWidth;
        const playheadColor = props.playheadColor;
        const playheadOpacity = props.playheadOpacity;
        const playheadPosition = props.playheadPosition;
        const playheadOffset = props.playheadOffset;
        const showPiano = props.showPiano;
        const whiteKeyColor = props.whiteKeyColor;
        const blackKeyColor = props.blackKeyColor;
        const pianoOpacity = props.pianoOpacity;
        const pianoRightBorderColor = props.pianoRightBorderColor;
        const pianoRightBorderWidth = props.pianoRightBorderWidth;

        // Update local timing manager from global store for view window duration calculations
        try {
            const state = useTimelineStore.getState();
            const bpm = state.timeline.globalBpm || 120;
            const beatsPerBar = state.timeline.beatsPerBar || 4;
            this.timingManager.setBPM(bpm);
            this.timingManager.setBeatsPerBar(beatsPerBar);
            // If a master tempo map exists, apply to timing manager for accurate windows
            if (state.timeline.masterTempoMap && state.timeline.masterTempoMap.length > 0) {
                this.timingManager.setTempoMap(state.timeline.masterTempoMap, 'seconds');
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
                    pianoRightBorderColor,
                    pianoRightBorderWidth
                );
                renderObjects.push(border);
            }
        }

        // Determine window around current time
        const duration = this.timingManager.getTimeUnitDuration(timeUnitBars);
        const windowStart = effectiveTime - duration * playheadPosition;
        const windowEnd = windowStart + duration;

        // Fetch notes for this window from timeline store
        const trackIds = props.midiTrackIds;
        const trackId = props.midiTrackId;
        const effectiveTrackIds = trackIds.length > 0 ? trackIds : trackId ? [trackId] : [];
        const state = useTimelineStore.getState();
        const rawNotes =
            effectiveTrackIds.length > 0
                ? selectNotesInWindow(state, {
                      trackIds: effectiveTrackIds,
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
                    pianoWidth,
                    rollWidth: elementWidth,
                    playheadPosition,
                    playheadOffset,
                    windowStart,
                    windowEnd,
                    currentTime: effectiveTime,
                },
                rawNotes as any
            );

            // Style customizations
            const noteCornerRadius = props.noteCornerRadius;
            const noteStrokeColor = props.noteStrokeColor;
            const noteStrokeWidth = props.noteStrokeWidth;
            const noteGlowColor = props.noteGlowColor;
            const noteGlowBlur = props.noteGlowBlur;
            const noteGlowOpacity = props.noteGlowOpacity;
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0)
                    obj.setCornerRadius(noteCornerRadius);
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function')
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
                if (noteGlowBlur > 0 && typeof obj.setShadow === 'function') {
                    let glowColorOut = noteGlowColor;
                    if (noteGlowColor.startsWith('#') && noteGlowOpacity < 1) {
                        const r = parseInt(noteGlowColor.substr(1, 2), 16);
                        const g = parseInt(noteGlowColor.substr(3, 2), 16);
                        const b = parseInt(noteGlowColor.substr(5, 2), 16);
                        glowColorOut = `rgba(${r},${g},${b},${noteGlowOpacity})`;
                    }
                    obj.setShadow(glowColorOut, noteGlowBlur, 0, 0);
                }
            });
            renderObjects.push(...animatedRenderObjects);
        }

        // Add a non-drawing rectangle to establish layout bounds for the content area
        {
            const totalHeight = (maxNote - minNote + 1) * noteHeight;
            const layoutRect = new Rectangle(0, 0, pianoWidth + elementWidth, totalHeight, null, null, 0);
            (layoutRect as any).setIncludeInLayoutBounds?.(true);
            renderObjects.push(layoutRect);
        }

        if (showPlayhead) {
            const ph = this._createStaticPlayhead(
                pianoWidth,
                elementWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor,
                playheadPosition,
                playheadOffset
            );
            (ph as any[]).forEach((l) => {
                l.setOpacity?.(playheadOpacity);
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
        const props = this.getSchemaProps({
            animationType: { transform: asTrimmedString, defaultValue: 'expand' },
        });
        return props.animationType ?? 'expand';
    }
    getAttackDuration(): number {
        const props = this.getSchemaProps({
            attackDuration: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 0.3,
            },
        });
        return props.attackDuration ?? 0.3;
    }
    getDecayDuration(): number {
        const props = this.getSchemaProps({
            decayDuration: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 0.3,
            },
        });
        return props.decayDuration ?? 0.3;
    }
    getReleaseDuration(): number {
        const props = this.getSchemaProps({
            releaseDuration: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, numeric);
                },
                defaultValue: 0.3,
            },
        });
        return props.releaseDuration ?? 0.3;
    }
    getTimeUnitBars(): number {
        const props = this.getSchemaProps({
            timeUnitBars: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(1, Math.round(numeric));
                },
                defaultValue: 1,
            },
        });
        return props.timeUnitBars ?? 1;
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
        const props = this.getSchemaProps({
            useChannelColors: { transform: asBoolean, defaultValue: false },
            noteColor: { transform: (value) => normalizeColorAlphaValue(value, DEFAULT_NOTE_COLOR) },
            noteOpacity: {
                transform: (value, element) => {
                    const numeric = asNumber(value, element);
                    return numeric === undefined ? undefined : Math.max(0, Math.min(1, numeric));
                },
                defaultValue: undefined,
            },
            channel0Color: { transform: asTrimmedString },
        });
        const rawBaseColor = props.noteColor ?? props.channel0Color ?? DEFAULT_NOTE_COLOR;
        const baseColor = applyLegacyOpacity(
            normalizeColorAlphaValue(rawBaseColor, DEFAULT_NOTE_COLOR),
            props.noteOpacity
        );
        if (!props.useChannelColors) {
            return Array.from({ length: 16 }, () => baseColor);
        }

        const channelDescriptors: Record<string, PropertyDescriptor<string | undefined, this>> = {};
        for (let i = 0; i < 16; i++) {
            channelDescriptors[`channel${i}Color`] = { transform: asTrimmedString };
        }
        const channelColors = this.getSchemaProps(channelDescriptors);

        return Array.from({ length: 16 }, (_, index) => {
            const key = `channel${index}Color` as const;
            const rawChannelColor = (channelColors[key] as string | undefined) ?? baseColor;
            return applyLegacyOpacity(normalizeColorAlphaValue(rawChannelColor, baseColor), props.noteOpacity);
        });
    }
}
