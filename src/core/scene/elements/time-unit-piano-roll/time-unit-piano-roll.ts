// TimeUnitPianoRoll scene element with Property Binding System
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { Line, Text, RenderObject, Rectangle } from '@core/render/render-objects';
import { AnimationController } from './animation-controller';
import { getAnimationSelectOptions } from '@animation/note-animations';
import { NoteBlock } from './note-block';
import { MidiManager } from '@core/midi/midi-manager';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';
import { debugLog } from '@utils/debug-log';

const DEFAULT_ROLL_WIDTH = 800;

export class TimeUnitPianoRollElement extends SceneElement {
    public midiManager: MidiManager;
    public animationController: AnimationController;
    // (Min BBox cache removed; layout stabilizes via includeInLayoutBounds)

    constructor(id: string = 'timeUnitPianoRoll', config: { [key: string]: any } = {}) {
        super('timeUnitPianoRoll', id, config);

        // Initialize MIDI manager (with its own TimingManager)
        this.midiManager = new MidiManager(this.id);

        // Initialize animation controller
        this.animationController = new AnimationController(this);

        // midiFile handling removed; timeline tracks only
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

        return {
            name: 'Time Unit Piano Roll',
            description: 'Piano roll visualization split into time-aligned windows.',
            category: 'Note Displays',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Choose which MIDI track drives the piano roll.',
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'midiTrackRef',
                            label: 'MIDI Track',
                            default: null,
                            description: 'Pick a track from the current timeline session.',
                        },
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
                        {
                            key: 'rollWidth',
                            type: 'number',
                            label: 'Roll Width (px)',
                            default: DEFAULT_ROLL_WIDTH,
                            min: 200,
                            max: 4000,
                            step: 50,
                            description: 'Width of the scrolling window in pixels.',
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
                        { key: 'showNotes', type: 'boolean', label: 'Show Notes', default: true },
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
                            key: 'noteOpacity',
                            type: 'number',
                            label: 'Note Opacity',
                            default: 0.8,
                            min: 0,
                            max: 1,
                            step: 0.05,
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
                            visibleWhen: [
                                { key: 'showNotes', truthy: true },
                                { key: 'noteStrokeWidth', truthy: true },
                            ],
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
                    ],
                    presets: [
                        {
                            id: 'classicBlocks',
                            label: 'Classic Blocks',
                            values: { showNotes: true, noteHeight: 20, noteOpacity: 0.85, noteGlowOpacity: 0.4 },
                        },
                        {
                            id: 'ghosted',
                            label: 'Ghosted',
                            values: { showNotes: true, noteOpacity: 0.5, noteGlowOpacity: 0.2, noteStrokeWidth: 1 },
                        },
                        {
                            id: 'neon',
                            label: 'Neon',
                            values: {
                                showNotes: true,
                                noteOpacity: 0.9,
                                noteGlowOpacity: 0.7,
                                noteGlowBlur: 12,
                                noteGlowColor: 'rgba(56,189,248,0.7)',
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
                        { key: 'showNoteGrid', type: 'boolean', label: 'Show Note Grid', default: true },
                        {
                            key: 'noteGridColor',
                            type: 'color',
                            label: 'Grid Line Color',
                            default: '#333333',
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        },
                        {
                            key: 'noteGridLineWidth',
                            type: 'number',
                            label: 'Grid Line Width (px)',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        },
                        {
                            key: 'noteGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showNoteGrid', truthy: true }],
                        },
                    ],
                    presets: [
                        {
                            id: 'brightGuides',
                            label: 'Bright Guides',
                            values: { showNoteGrid: true, noteGridColor: '#64748b', noteGridOpacity: 0.8, noteGridLineWidth: 1 },
                        },
                        {
                            id: 'subtle',
                            label: 'Subtle Lines',
                            values: { showNoteGrid: true, noteGridColor: '#1f2937', noteGridOpacity: 0.4, noteGridLineWidth: 0.5 },
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
                        { key: 'showBeatGrid', type: 'boolean', label: 'Show Beat Grid', default: true },
                        {
                            key: 'beatGridBarColor',
                            type: 'color',
                            label: 'Bar Line Color',
                            default: '#666666',
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        },
                        {
                            key: 'beatGridBeatColor',
                            type: 'color',
                            label: 'Beat Line Color',
                            default: '#444444',
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        },
                        {
                            key: 'beatGridBarWidth',
                            type: 'number',
                            label: 'Bar Line Width (px)',
                            default: 2,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        },
                        {
                            key: 'beatGridBeatWidth',
                            type: 'number',
                            label: 'Beat Line Width (px)',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        },
                        {
                            key: 'beatGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showBeatGrid', truthy: true }],
                        },
                    ],
                    presets: [
                        {
                            id: 'barsAndBeats',
                            label: 'Bars & Beats',
                            values: { showBeatGrid: true, beatGridBarWidth: 2, beatGridBeatWidth: 1, beatGridOpacity: 0.9 },
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
                        { key: 'showPiano', type: 'boolean', label: 'Show Piano', default: false },
                        {
                            key: 'pianoWidth',
                            type: 'number',
                            label: 'Piano Width (px)',
                            default: 0,
                            min: 80,
                            max: 300,
                            step: 10,
                            visibleWhen: [{ key: 'showPiano', truthy: true }],
                        },
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
                            values: { showPiano: true, whiteKeyColor: '#f8fafc', blackKeyColor: '#111827', pianoOpacity: 1 },
                        },
                        {
                            id: 'ghostKeys',
                            label: 'Ghost Keys',
                            values: { showPiano: true, whiteKeyColor: '#94a3b8', blackKeyColor: '#1f2937', pianoOpacity: 0.6 },
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
                        { key: 'showNoteLabels', type: 'boolean', label: 'Show Note Labels', default: true },
                        {
                            key: 'noteLabelFontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelFontSize',
                            type: 'number',
                            label: 'Font Size (px)',
                            default: 10,
                            min: 6,
                            max: 32,
                            step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelFontColor',
                            type: 'color',
                            label: 'Font Color',
                            default: '#ffffff',
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelInterval',
                            type: 'number',
                            label: 'Label Interval',
                            default: 1,
                            min: 1,
                            max: 24,
                            step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelStartNote',
                            type: 'number',
                            label: 'Label Start Note',
                            default: 0,
                            min: 0,
                            max: 127,
                            step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelOffsetX',
                            type: 'number',
                            label: 'Offset X (px)',
                            default: -10,
                            min: -200,
                            max: 200,
                            step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y (px)',
                            default: 0,
                            min: -200,
                            max: 200,
                            step: 1,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
                        {
                            key: 'noteLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showNoteLabels', truthy: true }],
                        },
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
                        { key: 'showBeatLabels', type: 'boolean', label: 'Show Beat Labels', default: true },
                        {
                            key: 'beatLabelFontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
                        {
                            key: 'beatLabelFontSize',
                            type: 'number',
                            label: 'Font Size (px)',
                            default: 12,
                            min: 6,
                            max: 48,
                            step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
                        {
                            key: 'beatLabelFontColor',
                            type: 'color',
                            label: 'Font Color',
                            default: '#ffffff',
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
                        {
                            key: 'beatLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y (px)',
                            default: -5,
                            min: -200,
                            max: 200,
                            step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
                        {
                            key: 'beatLabelOffsetX',
                            type: 'number',
                            label: 'Offset X (px)',
                            default: 5,
                            min: -200,
                            max: 200,
                            step: 1,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
                        {
                            key: 'beatLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'showBeatLabels', truthy: true }],
                        },
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
                    ],
                    presets: [
                        {
                            id: 'expand',
                            label: 'Expand',
                            values: { animationType: 'expand', attackDuration: 0.3, decayDuration: 0.3, releaseDuration: 0.3 },
                        },
                        {
                            id: 'staccato',
                            label: 'Staccato',
                            values: { animationType: 'expand', attackDuration: 0.1, decayDuration: 0.15, releaseDuration: 0.2 },
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
                            values: { showPlayhead: true, playheadColor: '#ff6b6b', playheadLineWidth: 2, playheadOpacity: 1 },
                        },
                        {
                            id: 'thin',
                            label: 'Thin Line',
                            values: { showPlayhead: true, playheadLineWidth: 1, playheadOpacity: 0.8, playheadColor: '#f8fafc' },
                        },
                        { id: 'hidden', label: 'Hidden', values: { showPlayhead: false } },
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
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const renderObjects: RenderObject[] = [];

        // Get current property values through bindings (global timing used; no per-element bpm/meter)
        // timeOffset removed; targetTime used directly
        const effectiveTime = targetTime;
        const timeUnitBars = this.getProperty<number>('timeUnitBars');
        const showPiano = this.getProperty<boolean>('showPiano'); // Keep this declaration
        const pianoWidth = showPiano ? this.getProperty<number>('pianoWidth') : 0; // Keep this declaration
        const rollWidth = this.getProperty<number>('rollWidth');
        const effectiveRollWidth = rollWidth ?? DEFAULT_ROLL_WIDTH;
        const showNoteGrid = this.getProperty<boolean>('showNoteGrid');
        const showNoteLabels = this.getProperty<boolean>('showNoteLabels');
        const showNotes = this.getProperty<boolean>('showNotes');
        const minNote = this.getProperty<number>('minNote');
        const maxNote = this.getProperty<number>('maxNote');
        const showBeatGrid = this.getProperty<boolean>('showBeatGrid');
        const showBeatLabels = this.getProperty<boolean>('showBeatLabels');
        const noteHeight = this.getProperty<number>('noteHeight');
        const showPlayhead = this.getProperty<boolean>('showPlayhead');
        const playheadLineWidth = this.getProperty<number>('playheadLineWidth');
        const playheadColor = this.getProperty<string>('playheadColor') || '#ff6b6b';
        const playheadOpacity = this.getProperty<number>('playheadOpacity') ?? 1;
        const whiteKeyColor = this.getProperty<string>('whiteKeyColor') || '#f0f0f0';
        const blackKeyColor = this.getProperty<string>('blackKeyColor') || '#555555';
        const pianoOpacity = this.getProperty<number>('pianoOpacity') ?? 1;
        const pianoRightBorderColor = this.getProperty<string>('pianoRightBorderColor') || '#333333';
        const pianoRightBorderWidth = this.getProperty<number>('pianoRightBorderWidth') || 2;
        // (Min BBox properties removed)
        // Style configs
        const noteGridColor = this.getProperty<string>('noteGridColor') || '#333333';
        const noteGridLineWidth = this.getProperty<number>('noteGridLineWidth') || 1;
        const noteGridOpacity = this.getProperty<number>('noteGridOpacity') ?? 1;
        const beatGridBarColor = this.getProperty<string>('beatGridBarColor') || '#666666';
        const beatGridBeatColor = this.getProperty<string>('beatGridBeatColor') || '#444444';
        const beatGridBarWidth = this.getProperty<number>('beatGridBarWidth') || 2;
        const beatGridBeatWidth = this.getProperty<number>('beatGridBeatWidth') || 1;
        const beatGridOpacity = this.getProperty<number>('beatGridOpacity') ?? 1;
        const noteLabelFontSelection = this.getProperty<string>('noteLabelFontFamily') || 'Arial';
        const { family: noteLabelFontFamily, weight: noteLabelFontWeightPart } =
            parseFontSelection(noteLabelFontSelection);
        const noteLabelFontSize = this.getProperty<number>('noteLabelFontSize') || 10;
        const noteLabelFontColor = this.getProperty<string>('noteLabelFontColor') || '#ffffff';
        const noteLabelFontWeight = (noteLabelFontWeightPart || '400').toString();
        const noteLabelInterval = this.getProperty<number>('noteLabelInterval') || 1;
        const noteLabelStartNote = this.getProperty<number>('noteLabelStartNote') || 0;
        const noteLabelOffsetX = this.getProperty<number>('noteLabelOffsetX') || -10;
        const noteLabelOffsetY = this.getProperty<number>('noteLabelOffsetY') || 0;
        const noteLabelOpacity = this.getProperty<number>('noteLabelOpacity') ?? 1;
        const beatLabelFontSelection = this.getProperty<string>('beatLabelFontFamily') || 'Arial';
        const { family: beatLabelFontFamily, weight: beatLabelFontWeightPart } =
            parseFontSelection(beatLabelFontSelection);
        const beatLabelFontSize = this.getProperty<number>('beatLabelFontSize') || 12;
        const beatLabelFontColor = this.getProperty<string>('beatLabelFontColor') || '#ffffff';
        const beatLabelFontWeight = (beatLabelFontWeightPart || '400').toString();
        const beatLabelOffsetY = this.getProperty<number>('beatLabelOffsetY') || -5;
        const beatLabelOffsetX = this.getProperty<number>('beatLabelOffsetX') || 5;
        const beatLabelOpacity = this.getProperty<number>('beatLabelOpacity') ?? 1;
        // Dynamic font loading for Google Fonts
        if (noteLabelFontFamily) ensureFontLoaded(noteLabelFontFamily, noteLabelFontWeight);
        if (beatLabelFontFamily) ensureFontLoaded(beatLabelFontFamily, beatLabelFontWeight);

        // midiFile handling removed; use timeline tracks only

        // Update timing via midiManager from global store
        try {
            const state = useTimelineStore.getState();
            const bpm = state.timeline.globalBpm || 120;
            const beatsPerBar = state.timeline.beatsPerBar || 4;
            this.midiManager.setBPM(bpm);
            this.midiManager.setBeatsPerBar(beatsPerBar);
            if (state.timeline.masterTempoMap && state.timeline.masterTempoMap.length > 0) {
                this.midiManager.timingManager.setTempoMap(state.timeline.masterTempoMap, 'seconds');
            } else {
                this.midiManager.timingManager.setTempoMap(null);
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
            const trackId = this.getProperty<string>('midiTrackId');
            const effectiveTrackIds = trackId ? [trackId] : [];
            if (effectiveTrackIds.length > 0) {
                // Query two-window span (prev + current) so release animation frames still have note segments
                const currentWin = this.midiManager.timingManager.getTimeUnitWindow(effectiveTime, timeUnitBars);
                // Derive previous window start without accessing private TimingManager internals.
                const beatsPerBar = this.midiManager.timingManager.beatsPerBar || 4;
                const bpm = this.midiManager.timingManager.bpm || 120;
                const secondsPerBeat = 60 / bpm;
                const windowBeats = timeUnitBars * beatsPerBar;
                const windowDurationApprox = windowBeats * secondsPerBeat; // acceptable for release span query
                const prevStart = currentWin.start - windowDurationApprox;
                const queryStart = prevStart;
                const queryEnd = currentWin.end;
                const state = useTimelineStore.getState();
                const events = selectNotesInWindow(state, {
                    trackIds: effectiveTrackIds,
                    startSec: queryStart,
                    endSec: queryEnd,
                });
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
            this.midiManager.timingManager,
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
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { noteHeight, minNote, maxNote, pianoWidth, rollWidth: effectiveRollWidth },
                noteBlocks,
                effectiveTime
            );
            // Apply note style customizations
            const noteOpacity = this.getProperty<number>('noteOpacity') ?? 0.8;
            const noteCornerRadius = this.getProperty<number>('noteCornerRadius') || 0;
            const noteStrokeColor = this.getProperty<string>('noteStrokeColor') || undefined;
            const noteStrokeWidth = this.getProperty<number>('noteStrokeWidth') || 0;
            const noteGlowColor = this.getProperty<string>('noteGlowColor') || 'rgba(255,255,255,0.5)';
            const noteGlowBlur = this.getProperty<number>('noteGlowBlur') || 0;
            const noteGlowOpacity = this.getProperty<number>('noteGlowOpacity') ?? 0.5;
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
                if (typeof obj.setGlobalAlpha === 'function') {
                    obj.setGlobalAlpha(noteOpacity);
                } else if (typeof obj.setOpacity === 'function') {
                    obj.setOpacity(noteOpacity);
                }
                if (noteGlowBlur > 0 && typeof obj.setShadow === 'function') {
                    // If hex color convert to rgba with glow opacity
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
            debugLog(`[_buildRenderObjects] Created ${animatedRenderObjects.length} animated note blocks`);
            renderObjects.push(...animatedRenderObjects);
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
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.midiManager.timingManager.beatsPerBar || 4;
            // Only include pianoWidth if showPiano is true
            const effectivePianoWidth = showPiano ? pianoWidth : 0;
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
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const beatsPerBarForGrid = this.midiManager.timingManager.beatsPerBar || 4;
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
                playheadColor
            );
            (ph as any[]).forEach((l) => {
                l.setOpacity?.(playheadOpacity);
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
        const totalHeight = (maxNote - minNote + 1) * noteHeight;
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
        const beats = this.midiManager.timingManager.getBeatGridInWindow(windowStart, windowEnd);
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
            const noteName = this.midiManager.getNoteName(note);
            const label = new Text(pianoWidth - 10, y, noteName, '10px Arial', '#ffffff', 'right', 'middle');
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
        const beats = this.midiManager.timingManager.getBeatGridInWindow(windowStart, windowEnd);
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
        const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
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

    // Note name resolution handled by MidiManager

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
        return this.getProperty<string>('animationType');
    }

    // ADSR phase durations
    getAttackDuration(): number {
        return Math.max(0, this.getProperty<number>('attackDuration') ?? 0.3);
    }

    getDecayDuration(): number {
        return Math.max(0, this.getProperty<number>('decayDuration') ?? 0.3);
    }

    getReleaseDuration(): number {
        return Math.max(0, this.getProperty<number>('releaseDuration') ?? 0.3);
    }

    getTimeUnitBars(): number {
        return this.getProperty<number>('timeUnitBars');
    }

    setTimeUnitBars(bars: number): this {
        this.setProperty('timeUnitBars', bars);
        return this;
    }

    getTimeUnit(): number {
        // Provide a tempo-aware duration of a bar group using default reference time
        return this.midiManager.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }

    // Removed midiFile getters/setters

    // Binding-specific methods (timing macro binding removed)

    // Removed midiFile macro binding

    /**
     * Get channel colors for MIDI channels
     */
    getChannelColors(): string[] {
        const colors: string[] = [];
        for (let i = 0; i < 16; i++) {
            const key = `channel${i}Color`;
            const val = this.getProperty<string>(key);
            colors.push(val || '#ffffff');
        }
        return colors;
    }

    /**
     * Load MIDI data directly (for programmatic use)
     */
    loadMIDIData(midiData: any, notes: any[]): this {
        this.midiManager.loadMIDIData(midiData, notes);
        this._dispatchChangeEvent();
        return this;
    }
}
