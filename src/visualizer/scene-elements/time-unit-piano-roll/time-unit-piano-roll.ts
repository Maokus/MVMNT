// TimeUnitPianoRoll scene element with Property Binding System
import { SceneElement } from '../base';
import { RenderObjectInterface, EnhancedConfigSchema } from '../../types.js';
import { ensureFontLoaded, parseFontSelection } from '../../../utils/font-loader';
import { Line, Text, EmptyRenderObject } from '../../render-objects';
import { AnimationController } from './animation-controller';
import { getAnimationSelectOptions } from './note-animations';
import { NoteBlock } from './note-block';
import { MidiManager } from '../../midi-manager';
import { debugLog } from '../../utils/debug-log.js';
import { globalMacroManager } from '../../macro-manager';
import { ConstantBinding } from '../../property-bindings';

export class TimeUnitPianoRollElement extends SceneElement {
    public midiManager: MidiManager;
    public animationController: AnimationController;
    // BBox cache that stores top-left and bottom-right points for the full-display configuration per time bucket
    // Keyed by timeBucket (ms). Invalidated when relevant configs change.
    private _ensureMinBBoxCache: Map<number, { tl: { x: number; y: number }; br: { x: number; y: number } }> =
        new Map();
    private _ensureMinBBoxCacheConfigHash: string | undefined;
    private _currentMidiFile: File | null = null;
    private _midiMacroListener?: (
        eventType:
            | 'macroValueChanged'
            | 'macroCreated'
            | 'macroDeleted'
            | 'macroAssigned'
            | 'macroUnassigned'
            | 'macrosImported',
        data: any
    ) => void;

    constructor(id: string = 'timeUnitPianoRoll', config: { [key: string]: any } = {}) {
        super('timeUnitPianoRoll', id, config);

        // Initialize MIDI manager (with its own TimingManager)
        this.midiManager = new MidiManager(this.id);

        // Initialize animation controller
        this.animationController = new AnimationController(this);

        // Set up specific MIDI file change handling
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Time Unit Piano Roll',
            description: 'Piano Roll visualization split into time units',
            category: 'complete',
            groups: [
                ...base.groups,
                // Timing (tempo + offset)
                {
                    id: 'timing',
                    label: 'Timing',
                    collapsed: true,
                    properties: [
                        {
                            key: 'bpm',
                            type: 'number',
                            label: 'BPM (Tempo)',
                            default: 120,
                            min: 20,
                            max: 300,
                            step: 0.1,
                            description: 'Beats per minute for this element',
                        },
                        {
                            key: 'beatsPerBar',
                            type: 'number',
                            label: 'Beats per Bar',
                            default: 4,
                            min: 1,
                            max: 16,
                            step: 1,
                            description: 'Number of beats in each bar for this element',
                        },
                        {
                            key: 'timeOffset',
                            type: 'number',
                            label: 'Time Offset (s)',
                            default: 0,
                            step: 0.01,
                            description: 'Offset (seconds) added to target time for this element (can be negative)',
                        },
                    ],
                },
                // Channel Colors separated so Notes group only has geometry / style
                {
                    id: 'noteColors',
                    label: 'Note Colors (per MIDI channel)',
                    collapsed: true,
                    properties: Array.from({ length: 16 }).map((_, i) => ({
                        key: `channel${i}Color`,
                        type: 'color',
                        label: `Channel ${i + 1}`,
                        default: [
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
                        ][i],
                        description: `Color for MIDI channel ${i + 1}`,
                    })),
                },
                {
                    id: 'midiFile',
                    label: 'MIDI File',
                    collapsed: true,
                    properties: [
                        {
                            key: 'midiFile',
                            type: 'file',
                            label: 'MIDI File',
                            accept: '.mid,.midi',
                            default: null,
                            description: 'Upload a MIDI file specifically for this piano roll element',
                        },
                    ],
                },
                // Dimensions & Range
                {
                    id: 'dimensions',
                    label: 'Dimensions',
                    collapsed: true,
                    properties: [
                        {
                            key: 'pianoWidth',
                            type: 'number',
                            label: 'Piano Width',
                            default: 120,
                            min: 80,
                            max: 300,
                            step: 10,
                            description: 'Width of the piano keys section in pixels',
                        },
                        {
                            key: 'rollWidth',
                            type: 'number',
                            label: 'Roll Width',
                            default: 800,
                            min: 200,
                            max: 2000,
                            step: 50,
                            description: 'Width of the roll section in pixels (auto-calculated if empty)',
                        },
                        {
                            key: 'timeUnitBars',
                            type: 'number',
                            label: 'Time Unit (Bars)',
                            default: 1,
                            min: 1,
                            max: 8,
                            step: 1,
                            description: 'Number of bars shown in each time unit',
                        },
                        {
                            key: 'minNote',
                            type: 'number',
                            label: 'Minimum Note',
                            default: 30,
                            min: 0,
                            max: 127,
                            step: 1,
                            description: 'Lowest MIDI note to display (21 = A0)',
                        },
                        {
                            key: 'maxNote',
                            type: 'number',
                            label: 'Maximum Note',
                            default: 72,
                            min: 0,
                            max: 127,
                            step: 1,
                            description: 'Highest MIDI note to display (108 = C8)',
                        },
                    ],
                },
                // Notes (geometry & style)
                {
                    id: 'notes',
                    label: 'Notes',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showNotes',
                            type: 'boolean',
                            label: 'Show Notes',
                            default: true,
                            description: 'Show MIDI note blocks',
                        },
                        {
                            key: 'noteHeight',
                            type: 'number',
                            label: 'Note Height',
                            default: 20,
                            min: 4,
                            max: 40,
                            step: 1,
                            description: 'Height of MIDI note blocks in pixels',
                        },
                        {
                            key: 'noteOpacity',
                            type: 'number',
                            label: 'Note Opacity',
                            default: 0.8,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Base opacity of notes',
                        },
                        {
                            key: 'noteCornerRadius',
                            type: 'number',
                            label: 'Note Corner Radius',
                            default: 2,
                            min: 0,
                            max: 20,
                            step: 1,
                            description: 'Rounded corner radius for notes',
                        },
                        {
                            key: 'noteStrokeColor',
                            type: 'color',
                            label: 'Note Stroke Color',
                            default: '#ffffff',
                            description: 'Stroke color for notes (optional)',
                        },
                        {
                            key: 'noteStrokeWidth',
                            type: 'number',
                            label: 'Note Stroke Width',
                            default: 0,
                            min: 0,
                            max: 10,
                            step: 1,
                            description: 'Stroke width (0 disables stroke)',
                        },
                        {
                            key: 'noteGlowColor',
                            type: 'color',
                            label: 'Note Glow Color',
                            default: 'rgba(255,255,255,0.5)',
                            description: 'Glow / shadow color (applied if blur > 0)',
                        },
                        {
                            key: 'noteGlowBlur',
                            type: 'number',
                            label: 'Note Glow Blur',
                            default: 0,
                            min: 0,
                            max: 50,
                            step: 1,
                            description: 'Blur radius for glow (0 disables)',
                        },
                        {
                            key: 'noteGlowOpacity',
                            type: 'number',
                            label: 'Note Glow Opacity',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity multiplier for glow',
                        },
                    ],
                },
                // Note Grid (horizontal)
                {
                    id: 'noteGrid',
                    label: 'Note Grid',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showNoteGrid',
                            type: 'boolean',
                            label: 'Show Note Grid',
                            default: true,
                            description: 'Show horizontal grid lines for notes',
                        },
                        {
                            key: 'noteGridColor',
                            type: 'color',
                            label: 'Grid Line Color',
                            default: '#333333',
                            description: 'Color of note grid lines',
                        },
                        {
                            key: 'noteGridLineWidth',
                            type: 'number',
                            label: 'Grid Line Width',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            description: 'Line width of note grid lines',
                        },
                        {
                            key: 'noteGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of note grid lines',
                        },
                    ],
                },
                // Beat Grid (vertical)
                {
                    id: 'beatGrid',
                    label: 'Beat Grid',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showBeatGrid',
                            type: 'boolean',
                            label: 'Show Beat Grid',
                            default: true,
                            description: 'Show vertical beat grid lines',
                        },
                        {
                            key: 'beatGridBarColor',
                            type: 'color',
                            label: 'Bar Line Color',
                            default: '#666666',
                            description: 'Color for bar start lines',
                        },
                        {
                            key: 'beatGridBeatColor',
                            type: 'color',
                            label: 'Beat Line Color',
                            default: '#444444',
                            description: 'Color for regular beat lines',
                        },
                        {
                            key: 'beatGridBarWidth',
                            type: 'number',
                            label: 'Bar Line Width',
                            default: 2,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            description: 'Line width for bar lines',
                        },
                        {
                            key: 'beatGridBeatWidth',
                            type: 'number',
                            label: 'Beat Line Width',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            description: 'Line width for beat lines',
                        },
                        {
                            key: 'beatGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of beat grid lines',
                        },
                    ],
                },
                // Note Labels (piano keys)
                {
                    id: 'noteLabels',
                    label: 'Note Labels',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showNoteLabels',
                            type: 'boolean',
                            label: 'Show Note Labels',
                            default: true,
                            description: 'Show note names (C, D, E, etc.)',
                        },
                        {
                            key: 'noteLabelFontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Font family for note labels (Google Fonts supported)',
                        },
                        {
                            key: 'noteLabelFontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 10,
                            min: 6,
                            max: 32,
                            step: 1,
                            description: 'Font size (px)',
                        },
                        {
                            key: 'noteLabelFontColor',
                            type: 'color',
                            label: 'Font Color',
                            default: '#ffffff',
                            description: 'Color of note labels',
                        },
                        // weight encoded in font family selection value now (family|weight)
                        {
                            key: 'noteLabelInterval',
                            type: 'number',
                            label: 'Label Interval',
                            default: 1,
                            min: 1,
                            max: 24,
                            step: 1,
                            description: 'Show every Nth note label',
                        },
                        {
                            key: 'noteLabelStartNote',
                            type: 'number',
                            label: 'Label Start Note',
                            default: 0,
                            min: 0,
                            max: 127,
                            step: 1,
                            description: 'Offset note index for interval (0 = first visible note)',
                        },
                        {
                            key: 'noteLabelOffsetX',
                            type: 'number',
                            label: 'Offset X',
                            default: -10,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Horizontal offset (pixels) from piano edge',
                        },
                        {
                            key: 'noteLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y',
                            default: 0,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Vertical offset (pixels)',
                        },
                        {
                            key: 'noteLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of note labels',
                        },
                    ],
                },
                // Beat Labels (bars)
                {
                    id: 'beatLabels',
                    label: 'Beat / Bar Labels',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showBeatLabels',
                            type: 'boolean',
                            label: 'Show Beat Labels',
                            default: true,
                            description: 'Show beat and bar labels',
                        },
                        {
                            key: 'beatLabelFontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Font family for bar labels (Google Fonts supported)',
                        },
                        {
                            key: 'beatLabelFontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 12,
                            min: 6,
                            max: 48,
                            step: 1,
                            description: 'Font size (px)',
                        },
                        {
                            key: 'beatLabelFontColor',
                            type: 'color',
                            label: 'Font Color',
                            default: '#ffffff',
                            description: 'Color of bar labels',
                        },
                        // weight encoded in font family selection value now (family|weight)
                        {
                            key: 'beatLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y',
                            default: -5,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Vertical offset (pixels)',
                        },
                        {
                            key: 'beatLabelOffsetX',
                            type: 'number',
                            label: 'Offset X',
                            default: 5,
                            min: -200,
                            max: 200,
                            step: 1,
                            description: 'Horizontal offset (pixels) from beat line',
                        },
                        {
                            key: 'beatLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of beat labels',
                        },
                    ],
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    collapsed: true,
                    properties: [
                        {
                            key: 'animationType',
                            type: 'select',
                            label: 'Animation Type',
                            default: 'expand',
                            options: [...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' }],
                            description: 'Type of animation for note appearance',
                        },
                        {
                            key: 'attackDuration',
                            type: 'number',
                            label: 'Attack Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                            description: 'Time (s) before a note becomes visible (preview fade-in)',
                        },
                        {
                            key: 'decayDuration',
                            type: 'number',
                            label: 'Decay Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                            description: 'Time (s) the note takes to reach full visibility',
                        },
                        {
                            key: 'releaseDuration',
                            type: 'number',
                            label: 'Release Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                            description: 'Time (s) after the window ends before the note fully fades out',
                        },
                    ],
                },
                {
                    id: 'playhead',
                    label: 'Playhead',
                    collapsed: true,
                    properties: [
                        {
                            key: 'showPlayhead',
                            type: 'boolean',
                            label: 'Show Playhead',
                            default: true,
                            description: 'Show the playhead line',
                        },
                        {
                            key: 'playheadColor',
                            type: 'color',
                            label: 'Playhead Color',
                            default: '#ff6b6b',
                            description: 'Color of the playhead line',
                        },
                        {
                            key: 'playheadLineWidth',
                            type: 'number',
                            label: 'Playhead Line Width',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 1,
                            description: 'Width of the playhead line in pixels',
                        },
                        {
                            key: 'playheadOpacity',
                            type: 'number',
                            label: 'Playhead Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Opacity of playhead line',
                        },
                    ],
                },
                {
                    id: 'bbox',
                    label: 'Bounding Box',
                    collapsed: true,
                    properties: [
                        {
                            key: 'ensureMinBBox',
                            type: 'boolean',
                            label: 'Ensure Min BBox',
                            default: true,
                            description:
                                'Stabilize layout by ensuring the bounding box matches the full display (grids/labels) even when toggled off',
                        },
                        {
                            key: 'minBBoxPadding',
                            type: 'number',
                            label: 'Min Bounding Box Padding',
                            default: 0,
                            min: 0,
                            max: 2000,
                            step: 1,
                            description: 'Padding around the bounding box in pixels',
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        const renderObjects: RenderObjectInterface[] = [];

        // Get current property values through bindings
        const bpm = this.getProperty<number>('bpm');
        const beatsPerBar = this.getProperty<number>('beatsPerBar');
        const timeOffset = this.getProperty<number>('timeOffset') || 0;
        const effectiveTime = targetTime + timeOffset;
        const timeUnitBars = this.getProperty<number>('timeUnitBars');
        const pianoWidth = this.getProperty<number>('pianoWidth');
        const rollWidth = this.getProperty<number>('rollWidth');
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
        const ensureMinBBox = this.getProperty<boolean>('ensureMinBBox');
        const minBBoxPadding = this.getProperty<number>('minBBoxPadding');
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
        const legacyNoteWeight = (this as any).getProperty?.('noteLabelFontWeight');
        const noteLabelFontWeight = (noteLabelFontWeightPart || legacyNoteWeight || '400').toString();
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
        const legacyBeatWeight = (this as any).getProperty?.('beatLabelFontWeight');
        const beatLabelFontWeight = (beatLabelFontWeightPart || legacyBeatWeight || '400').toString();
        const beatLabelOffsetY = this.getProperty<number>('beatLabelOffsetY') || -5;
        const beatLabelOffsetX = this.getProperty<number>('beatLabelOffsetX') || 5;
        const beatLabelOpacity = this.getProperty<number>('beatLabelOpacity') ?? 1;
        // Dynamic font loading for Google Fonts
        if (noteLabelFontFamily) ensureFontLoaded(noteLabelFontFamily);
        if (beatLabelFontFamily) ensureFontLoaded(beatLabelFontFamily);

        // Handle MIDI file changes
        const midiFile = this.getProperty<File>('midiFile');
        if (midiFile !== this._currentMidiFile) {
            this._handleMIDIFileConfig(midiFile);
            this._currentMidiFile = midiFile;
        }

        // Update timing via midiManager
        this.midiManager.setBPM(bpm);
        this.midiManager.setBeatsPerBar(beatsPerBar);

        // Build clamped segments across prev/current/next windows for lifecycle-based rendering
        const windowedNoteBlocks: NoteBlock[] = NoteBlock.buildWindowedSegments(
            this.midiManager.getNotes(),
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
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { noteHeight, minNote, maxNote, pianoWidth, rollWidth },
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
            const noteLines = this._createNoteGridLines(minNote, maxNote, pianoWidth, rollWidth || 800, noteHeight);
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
            const beatLines = this._createBeatGridLines(
                windowStart,
                windowEnd,
                beatsPerBar,
                pianoWidth,
                rollWidth || 800,
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
            const labels = this._createNoteLabels(minNote, maxNote, pianoWidth, noteHeight);
            let visibleIndex = 0;
            for (const lbl of labels as any[]) {
                // interval logic based solely on visibleIndex
                if ((visibleIndex - noteLabelStartNote) % noteLabelInterval !== 0) {
                    lbl.setOpacity?.(0); // hide
                } else {
                    lbl.text && (lbl.font = `${noteLabelFontWeight} ${noteLabelFontSize}px ${noteLabelFontFamily}`);
                    lbl.color = noteLabelFontColor;
                    lbl.setOpacity?.(noteLabelOpacity);
                    lbl.x = pianoWidth + noteLabelOffsetX; // adjust relative to piano edge
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
            const labels = this._createBeatLabels(windowStart, windowEnd, beatsPerBar, pianoWidth, rollWidth || 800);
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
            const ph = this._createPlayhead(
                effectiveTime,
                pianoWidth,
                rollWidth || 800,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor
            );
            (ph as any[]).forEach((l) => l.setOpacity?.(playheadOpacity));
            renderObjects.push(...ph);
        }

        // Optionally ensure minimum bounding box by adding two empty render objects at the cached TL/BR of the
        // full-display configuration (as if all Display toggles were true). This reduces jumping when grids/lines are toggled.
        if (ensureMinBBox) {
            const bbox = this._getOrComputeMinBBox(effectiveTime, {
                timeUnitBars,
                minNote,
                maxNote,
                pianoWidth,
                rollWidth: rollWidth || 800,
                noteHeight,
                beatsPerBar,
            });

            if (bbox) {
                const tl = new EmptyRenderObject(bbox.tl.x - minBBoxPadding, bbox.tl.y - minBBoxPadding, 1, 1, 0);
                const br = new EmptyRenderObject(bbox.br.x + minBBoxPadding, bbox.br.y + minBBoxPadding, 1, 1, 0);
                tl.setOpacity(0);
                br.setOpacity(0);
                renderObjects.push(tl, br);
            }
        }

        return renderObjects;
    }

    /**
     * Handle MIDI file configuration changes
     */
    private async _handleMIDIFileConfig(midiFileData: File | null): Promise<void> {
        if (!midiFileData) return;

        if (midiFileData instanceof File) {
            await this._loadMIDIFile(midiFileData);
        }
    }

    /**
     * Load and parse a MIDI file for this element
     */
    private async _loadMIDIFile(file: File): Promise<void> {
        try {
            console.log(`Loading MIDI file for bound element ${this.id}:`, file.name);

            const resetMacroValues = this._currentMidiFile !== file;
            await this.midiManager.loadMidiFile(file, resetMacroValues);

            console.log(`Successfully loaded MIDI file for bound element ${this.id}:`, {
                duration: this.midiManager.getDuration(),
                noteCount: this.midiManager.getNotes().length,
                bpm: this.midiManager.timingManager.bpm,
            });

            // If minNote/maxNote are constant-bound, set them to actual min/max from the MIDI snippet
            const notes = this.midiManager.getNotes();
            if (Array.isArray(notes) && notes.length > 0) {
                const noteValues = notes.map((n: any) => n.note).filter((v: any) => typeof v === 'number');
                if (noteValues.length > 0) {
                    const actualMin = Math.max(0, Math.min(...noteValues));
                    const actualMax = Math.min(127, Math.max(...noteValues));
                    const minBinding = this.getBinding('minNote');
                    const maxBinding = this.getBinding('maxNote');
                    if (minBinding instanceof ConstantBinding) {
                        this.setProperty('minNote', actualMin);
                    }
                    if (maxBinding instanceof ConstantBinding) {
                        this.setProperty('maxNote', actualMax);
                    }
                }
            }

            // Trigger a re-render
            this._dispatchChangeEvent();
            // Also trigger global visualizer re-render if available
            if (typeof window !== 'undefined') {
                const canvas: any = (window as any).debugVisualizer?.canvas;
                const vis: any = (window as any).debugVisualizer;
                if (vis && typeof vis.invalidateRender === 'function') {
                    vis.invalidateRender();
                } else if (canvas && canvas.dispatchEvent) {
                    canvas.dispatchEvent(new CustomEvent('visualizer-update'));
                }
            }
        } catch (error) {
            console.error(`Failed to load MIDI file for bound element ${this.id}:`, error);
        }
    }

    // Note block creation delegated to MidiManager

    /**
     * Create horizontal grid lines for notes
     */
    private _createNoteGridLines(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        rollWidth: number,
        noteHeight: number
    ): RenderObjectInterface[] {
        const lines: RenderObjectInterface[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;

        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - (note - minNote + 1) * noteHeight;
            const line = new Line(pianoWidth, y, pianoWidth + rollWidth, y, '#333333', 1);
            lines.push(line);
        }

        return lines;
    }

    /**
     * Create vertical grid lines for beats
     */
    private _createBeatGridLines(
        windowStart: number,
        windowEnd: number,
        beatsPerBar: number,
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number
    ): RenderObjectInterface[] {
        const lines: RenderObjectInterface[] = [];
        const beats = this.midiManager.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const strokeColor = b.isBarStart ? '#666666' : '#444444';
            const strokeWidth = b.isBarStart ? 2 : 1;
            const line = new Line(x, 0, x, totalHeight, strokeColor, strokeWidth);
            lines.push(line);
        }

        return lines;
    }

    /**
     * Create note name labels
     */
    private _createNoteLabels(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        noteHeight: number
    ): RenderObjectInterface[] {
        const labels: RenderObjectInterface[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;

        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - (note - minNote + 0.5) * noteHeight;
            const noteName = this.midiManager.getNoteName(note);

            const label = new Text(pianoWidth - 10, y, noteName, '10px Arial', '#ffffff', 'right', 'middle');
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
    ): RenderObjectInterface[] {
        const labels: RenderObjectInterface[] = [];
        const beats = this.midiManager.timingManager.getBeatGridInWindow(windowStart, windowEnd);
        const duration = Math.max(1e-9, windowEnd - windowStart);
        for (const b of beats) {
            if (!b.isBarStart) continue;
            const rel = (b.time - windowStart) / duration;
            const x = pianoWidth + rel * rollWidth;
            const bar = b.barNumber;
            const label = new Text(x + 5, -5, `Bar ${bar}`, '12px Arial', '#ffffff', 'left', 'bottom');
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
    ): RenderObjectInterface[] {
        const playheadObjects: RenderObjectInterface[] = [];

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

    /**
     * Compute and cache the min bounding box for the "full display" configuration at a given time bucket.
     * Extracted from _buildRenderObjects for readability.
     */
    private _getOrComputeMinBBox(
        targetTime: number,
        args: {
            timeUnitBars: number;
            minNote: number;
            maxNote: number;
            pianoWidth: number;
            rollWidth: number;
            noteHeight: number;
            beatsPerBar: number;
        }
    ): { tl: { x: number; y: number }; br: { x: number; y: number } } | undefined {
        // Invalidate cache if the configuration has changed
        const cfgHash = this._computeConfigHashForBBox();
        if (this._ensureMinBBoxCacheConfigHash !== cfgHash) {
            this._ensureMinBBoxCache.clear();
            this._ensureMinBBoxCacheConfigHash = cfgHash;
        }

        const timeBucket = Math.floor((isFinite(targetTime) ? targetTime : 0) * 1000);
        let cached = this._ensureMinBBoxCache.get(timeBucket);
        if (cached) return cached;

        const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
            targetTime,
            args.timeUnitBars
        );
        const totalHeight = (args.maxNote - args.minNote + 1) * args.noteHeight;

        // Build objects that define extents when all display toggles are true
        const fullObjs: RenderObjectInterface[] = [];
        fullObjs.push(
            ...this._createNoteGridLines(args.minNote, args.maxNote, args.pianoWidth, args.rollWidth, args.noteHeight)
        );
        fullObjs.push(
            ...this._createBeatGridLines(
                windowStart,
                windowEnd,
                args.beatsPerBar,
                args.pianoWidth,
                args.rollWidth,
                totalHeight
            )
        );
        fullObjs.push(...this._createNoteLabels(args.minNote, args.maxNote, args.pianoWidth, args.noteHeight));
        fullObjs.push(
            ...this._createBeatLabels(windowStart, windowEnd, args.beatsPerBar, args.pianoWidth, args.rollWidth)
        );

        // Compute bounds
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        let count = 0;
        for (const obj of fullObjs) {
            if (obj && typeof (obj as any).getBounds === 'function') {
                const b = (obj as any).getBounds();
                if (
                    b &&
                    typeof b.x === 'number' &&
                    typeof b.y === 'number' &&
                    typeof b.width === 'number' &&
                    typeof b.height === 'number' &&
                    isFinite(b.x) &&
                    isFinite(b.y) &&
                    isFinite(b.width) &&
                    isFinite(b.height)
                ) {
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                    count++;
                }
            }
        }

        cached =
            count === 0
                ? { tl: { x: 0, y: 0 }, br: { x: 0, y: 0 } }
                : { tl: { x: minX, y: minY }, br: { x: maxX, y: maxY } };
        this._ensureMinBBoxCache.set(timeBucket, cached);
        return cached;
    }

    // Build a configuration signature based on all current bindings to detect any config change
    private _computeConfigHashForBBox(): string {
        const cfgEntries: Record<string, any> = {};
        (this as any).bindings?.forEach((binding: any, key: string) => {
            try {
                const v = binding?.getValue?.();
                if (typeof File !== 'undefined' && v instanceof File) {
                    cfgEntries[key] = { __fileName: v.name || null };
                } else if (v && typeof v === 'object') {
                    cfgEntries[key] = JSON.parse(
                        JSON.stringify(v, (_k, val) => (val instanceof File ? { __fileName: val.name } : val))
                    );
                } else {
                    cfgEntries[key] = v;
                }
            } catch {
                cfgEntries[key] = String(binding?.getValue?.());
            }
        });
        return JSON.stringify(cfgEntries);
    }

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

    /**
     * Set up listener specifically for MIDI file changes to immediately process file
     */
    private _setupMIDIFileListener(): void {
        this._midiMacroListener = (
            eventType:
                | 'macroValueChanged'
                | 'macroCreated'
                | 'macroDeleted'
                | 'macroAssigned'
                | 'macroUnassigned'
                | 'macrosImported',
            data: any
        ) => {
            if (eventType === 'macroValueChanged' && data.name === 'midiFile') {
                // Check if this element is bound to the midiFile macro
                if (this.isBoundToMacro('midiFile', 'midiFile')) {
                    console.log(`[MIDI File Listener] Processing MIDI file change for element ${this.id}`);
                    // Get the new MIDI file and process it immediately
                    const newMidiFile = this.getProperty<File>('midiFile');
                    if (newMidiFile !== this._currentMidiFile) {
                        this._handleMIDIFileConfig(newMidiFile);
                        this._currentMidiFile = newMidiFile;
                        // Force immediate re-render so duration/UI updates without stepping
                        if (typeof window !== 'undefined') {
                            const vis: any = (window as any).debugVisualizer;
                            if (vis && typeof vis.invalidateRender === 'function') {
                                vis.invalidateRender();
                            }
                        }
                    }
                }
            }
        };
        globalMacroManager.addListener(this._midiMacroListener);
    }

    // Ensure listeners are detached when element is disposed
    dispose(): void {
        super.dispose();
        if (this._midiMacroListener) {
            globalMacroManager.removeListener(this._midiMacroListener);
            this._midiMacroListener = undefined;
        }
    }

    // Convenience methods for property access
    getBPM(): number {
        return this.getProperty<number>('bpm');
    }

    setBPM(bpm: number): this {
        this.setProperty('bpm', bpm);
        return this;
    }

    getBeatsPerBar(): number {
        return this.getProperty<number>('beatsPerBar');
    }

    setBeatsPerBar(beatsPerBar: number): this {
        this.setProperty('beatsPerBar', beatsPerBar);
        return this;
    }

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

    getMidiFile(): File | null {
        return this.getProperty<File>('midiFile');
    }

    setMidiFile(file: File | null): this {
        this.setProperty('midiFile', file);
        return this;
    }

    // Binding-specific methods
    bindBPMToMacro(macroId: string): this {
        this.bindToMacro('bpm', macroId);
        return this;
    }

    bindBeatsPerBarToMacro(macroId: string): this {
        this.bindToMacro('beatsPerBar', macroId);
        return this;
    }

    bindMidiFileToMacro(macroId: string): this {
        this.bindToMacro('midiFile', macroId);
        return this;
    }

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
