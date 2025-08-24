// MovingNotesPianoRoll scene element: static playhead, notes move across.
import { SceneElement } from '@core/scene/elements/base';
import { EnhancedConfigSchema } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { Line, Text, EmptyRenderObject, RenderObject } from '@core/render/render-objects';
import { getAnimationSelectOptions } from '@animation/note-animations';
import { NoteBlock } from '@core/scene/elements/time-unit-piano-roll/note-block';
import { MidiManager } from '@core/midi/midi-manager';
import { debugLog } from '@utils/debug-log';
import { globalMacroManager } from '@bindings/macro-manager';
import { ConstantBinding } from '@bindings/property-bindings';
import { MovingNotesAnimationController } from './animation-controller';

export class MovingNotesPianoRollElement extends SceneElement {
    public midiManager: MidiManager;
    public animationController: MovingNotesAnimationController;
    private _currentMidiFile: File | null = null;

    constructor(id: string = 'movingNotesPianoRoll', config: { [key: string]: any } = {}) {
        super('movingNotesPianoRoll', id, config);
        this.midiManager = new MidiManager(this.id);
        this.animationController = new MovingNotesAnimationController(this);
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Moving Notes Piano Roll',
            description: 'Notes move past a static playhead',
            category: 'complete',
            groups: [
                ...base.groups,
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
                        },
                        {
                            key: 'beatsPerBar',
                            type: 'number',
                            label: 'Beats per Bar',
                            default: 4,
                            min: 1,
                            max: 16,
                            step: 1,
                        },
                        { key: 'timeOffset', type: 'number', label: 'Time Offset (s)', default: 0, step: 0.01 },
                    ],
                },
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
                    })),
                },
                {
                    id: 'midiFile',
                    label: 'MIDI File',
                    collapsed: true,
                    properties: [
                        { key: 'midiFile', type: 'file', label: 'MIDI File', accept: '.mid,.midi', default: null },
                    ],
                },
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
                        },
                        {
                            key: 'rollWidth',
                            type: 'number',
                            label: 'Roll Width',
                            default: 800,
                            min: 200,
                            max: 2000,
                            step: 50,
                        },
                        {
                            key: 'timeUnitBars',
                            type: 'number',
                            label: 'Time Unit (Bars)',
                            default: 1,
                            min: 1,
                            max: 8,
                            step: 1,
                        },
                        {
                            key: 'minNote',
                            type: 'number',
                            label: 'Minimum Note',
                            default: 30,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                        {
                            key: 'maxNote',
                            type: 'number',
                            label: 'Maximum Note',
                            default: 72,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                    ],
                },
                {
                    id: 'notes',
                    label: 'Notes',
                    collapsed: true,
                    properties: [
                        { key: 'showNotes', type: 'boolean', label: 'Show Notes', default: true },
                        {
                            key: 'noteHeight',
                            type: 'number',
                            label: 'Note Height',
                            default: 20,
                            min: 4,
                            max: 40,
                            step: 1,
                        },
                        {
                            key: 'noteOpacity',
                            type: 'number',
                            label: 'Note Opacity',
                            default: 0.8,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                        {
                            key: 'noteCornerRadius',
                            type: 'number',
                            label: 'Note Corner Radius',
                            default: 2,
                            min: 0,
                            max: 20,
                            step: 1,
                        },
                        { key: 'noteStrokeColor', type: 'color', label: 'Note Stroke Color', default: '#ffffff' },
                        {
                            key: 'noteStrokeWidth',
                            type: 'number',
                            label: 'Note Stroke Width',
                            default: 0,
                            min: 0,
                            max: 10,
                            step: 1,
                        },
                        {
                            key: 'noteGlowColor',
                            type: 'color',
                            label: 'Note Glow Color',
                            default: 'rgba(255,255,255,0.5)',
                        },
                        {
                            key: 'noteGlowBlur',
                            type: 'number',
                            label: 'Note Glow Blur',
                            default: 0,
                            min: 0,
                            max: 50,
                            step: 1,
                        },
                        {
                            key: 'noteGlowOpacity',
                            type: 'number',
                            label: 'Note Glow Opacity',
                            default: 0.5,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'noteGrid',
                    label: 'Note Grid',
                    collapsed: true,
                    properties: [
                        { key: 'showNoteGrid', type: 'boolean', label: 'Show Note Grid', default: true },
                        { key: 'noteGridColor', type: 'color', label: 'Grid Line Color', default: '#333333' },
                        {
                            key: 'noteGridLineWidth',
                            type: 'number',
                            label: 'Grid Line Width',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                        },
                        {
                            key: 'noteGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'beatGrid',
                    label: 'Beat Grid',
                    collapsed: true,
                    properties: [
                        { key: 'showBeatGrid', type: 'boolean', label: 'Show Beat Grid', default: true },
                        { key: 'beatGridBarColor', type: 'color', label: 'Bar Line Color', default: '#666666' },
                        { key: 'beatGridBeatColor', type: 'color', label: 'Beat Line Color', default: '#444444' },
                        {
                            key: 'beatGridBarWidth',
                            type: 'number',
                            label: 'Bar Line Width',
                            default: 2,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                        },
                        {
                            key: 'beatGridBeatWidth',
                            type: 'number',
                            label: 'Beat Line Width',
                            default: 1,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                        },
                        {
                            key: 'beatGridOpacity',
                            type: 'number',
                            label: 'Grid Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'noteLabels',
                    label: 'Note Labels',
                    collapsed: true,
                    properties: [
                        { key: 'showNoteLabels', type: 'boolean', label: 'Show Note Labels', default: true },
                        { key: 'noteLabelFontFamily', type: 'font', label: 'Font Family', default: 'Inter' },
                        {
                            key: 'noteLabelFontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 10,
                            min: 6,
                            max: 32,
                            step: 1,
                        },
                        { key: 'noteLabelFontColor', type: 'color', label: 'Font Color', default: '#ffffff' },
                        {
                            key: 'noteLabelInterval',
                            type: 'number',
                            label: 'Label Interval',
                            default: 1,
                            min: 1,
                            max: 24,
                            step: 1,
                        },
                        {
                            key: 'noteLabelStartNote',
                            type: 'number',
                            label: 'Label Start Note',
                            default: 0,
                            min: 0,
                            max: 127,
                            step: 1,
                        },
                        {
                            key: 'noteLabelOffsetX',
                            type: 'number',
                            label: 'Offset X',
                            default: -10,
                            min: -200,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'noteLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y',
                            default: 0,
                            min: -200,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'noteLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                {
                    id: 'beatLabels',
                    label: 'Beat / Bar Labels',
                    collapsed: true,
                    properties: [
                        { key: 'showBeatLabels', type: 'boolean', label: 'Show Beat Labels', default: true },
                        { key: 'beatLabelFontFamily', type: 'font', label: 'Font Family', default: 'Inter' },
                        {
                            key: 'beatLabelFontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 12,
                            min: 6,
                            max: 48,
                            step: 1,
                        },
                        { key: 'beatLabelFontColor', type: 'color', label: 'Font Color', default: '#ffffff' },
                        {
                            key: 'beatLabelOffsetY',
                            type: 'number',
                            label: 'Offset Y',
                            default: -5,
                            min: -200,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'beatLabelOffsetX',
                            type: 'number',
                            label: 'Offset X',
                            default: 5,
                            min: -200,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'beatLabelOpacity',
                            type: 'number',
                            label: 'Label Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
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
                        },
                        {
                            key: 'attackDuration',
                            type: 'number',
                            label: 'Attack Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'decayDuration',
                            type: 'number',
                            label: 'Decay Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'releaseDuration',
                            type: 'number',
                            label: 'Release Duration',
                            default: 0.3,
                            min: 0,
                            max: 10.0,
                            step: 0.05,
                        },
                        {
                            key: 'playheadPosition',
                            type: 'number',
                            label: 'Playhead Position (0..1)',
                            default: 0.25,
                            min: 0,
                            max: 1,
                            step: 0.01,
                        },
                    ],
                },
                {
                    id: 'playhead',
                    label: 'Playhead',
                    collapsed: true,
                    properties: [
                        { key: 'showPlayhead', type: 'boolean', label: 'Show Playhead', default: true },
                        { key: 'playheadColor', type: 'color', label: 'Playhead Color', default: '#ff6b6b' },
                        {
                            key: 'playheadLineWidth',
                            type: 'number',
                            label: 'Playhead Line Width',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 1,
                        },
                        {
                            key: 'playheadOpacity',
                            type: 'number',
                            label: 'Playhead Opacity',
                            default: 1,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const renderObjects: RenderObject[] = [];
        const bpm = this.getProperty<number>('bpm');
        const beatsPerBar = this.getProperty<number>('beatsPerBar');
        const timeOffset = this.getProperty<number>('timeOffset') || 0;
        const effectiveTime = targetTime + timeOffset;
        const timeUnitBars = this.getProperty<number>('timeUnitBars');
        const pianoWidth = this.getProperty<number>('pianoWidth');
        const rollWidth = this.getProperty<number>('rollWidth') || 800;
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
        const playheadPosition = Math.max(0, Math.min(1, this.getProperty<number>('playheadPosition') ?? 0.25));

        // Fonts
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
        if (noteLabelFontFamily) ensureFontLoaded(noteLabelFontFamily, noteLabelFontWeight);
        if (beatLabelFontFamily) ensureFontLoaded(beatLabelFontFamily, beatLabelFontWeight);

        // MIDI file changes
        const midiFile = this.getProperty<File>('midiFile');
        if (midiFile !== this._currentMidiFile) {
            this._handleMIDIFileConfig(midiFile);
            this._currentMidiFile = midiFile;
        }

        this.midiManager.setBPM(bpm);
        this.midiManager.setBeatsPerBar(beatsPerBar);

        // Build segments across prev/current/next windows
        const windowedNoteBlocks: NoteBlock[] = NoteBlock.buildWindowedSegments(
            this.midiManager.getNotes(),
            this.midiManager.timingManager,
            effectiveTime,
            timeUnitBars
        );

        // Notes moving past static playhead
        if (showNotes && windowedNoteBlocks.length > 0) {
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                {
                    noteHeight,
                    minNote,
                    maxNote,
                    pianoWidth,
                    rollWidth,
                    playheadPosition,
                    windowStart,
                    windowEnd,
                    currentTime: effectiveTime,
                },
                windowedNoteBlocks
            );

            // Style customizations
            const noteOpacity = this.getProperty<number>('noteOpacity') ?? 0.8;
            const noteCornerRadius = this.getProperty<number>('noteCornerRadius') || 0;
            const noteStrokeColor = this.getProperty<string>('noteStrokeColor') || undefined;
            const noteStrokeWidth = this.getProperty<number>('noteStrokeWidth') || 0;
            const noteGlowColor = this.getProperty<string>('noteGlowColor') || 'rgba(255,255,255,0.5)';
            const noteGlowBlur = this.getProperty<number>('noteGlowBlur') || 0;
            const noteGlowOpacity = this.getProperty<number>('noteGlowOpacity') ?? 0.5;
            (animatedRenderObjects as any[]).forEach((obj) => {
                if (!obj) return;
                if (typeof obj.setCornerRadius === 'function' && noteCornerRadius > 0)
                    obj.setCornerRadius(noteCornerRadius);
                if (noteStrokeWidth > 0 && typeof obj.setStroke === 'function')
                    obj.setStroke(noteStrokeColor, noteStrokeWidth);
                if (typeof obj.setGlobalAlpha === 'function') obj.setGlobalAlpha(noteOpacity);
                else if (typeof obj.setOpacity === 'function') obj.setOpacity(noteOpacity);
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

        // Grids and labels use the same helpers as TimeUnitPianoRoll (copied inline for independence)
        if (showNoteGrid) {
            const noteLines = this._createNoteGridLines(minNote, maxNote, pianoWidth, rollWidth, noteHeight);
            const noteGridColor = this.getProperty<string>('noteGridColor') || '#333333';
            const noteGridLineWidth = this.getProperty<number>('noteGridLineWidth') || 1;
            const noteGridOpacity = this.getProperty<number>('noteGridOpacity') ?? 1;
            noteLines.forEach((l: any) => {
                l.setColor?.(noteGridColor);
                l.setLineWidth?.(noteGridLineWidth);
                l.setOpacity?.(noteGridOpacity);
            });
            renderObjects.push(...noteLines);
        }

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
                rollWidth,
                (maxNote - minNote + 1) * noteHeight
            );
            const beatGridBarColor = this.getProperty<string>('beatGridBarColor') || '#666666';
            const beatGridBeatColor = this.getProperty<string>('beatGridBeatColor') || '#444444';
            const beatGridBarWidth = this.getProperty<number>('beatGridBarWidth') || 2;
            const beatGridBeatWidth = this.getProperty<number>('beatGridBeatWidth') || 1;
            const beatGridOpacity = this.getProperty<number>('beatGridOpacity') ?? 1;
            beatLines.forEach((l: any) => {
                const isBar = (l.lineWidth || 1) > 1;
                l.setColor?.(isBar ? beatGridBarColor : beatGridBeatColor);
                l.setLineWidth?.(isBar ? beatGridBarWidth : beatGridBeatWidth);
                l.setOpacity?.(beatGridOpacity);
            });
            renderObjects.push(...beatLines);
        }

        if (showNoteLabels) {
            const labels = this._createNoteLabels(minNote, maxNote, pianoWidth, noteHeight);
            let visibleIndex = 0;
            for (const lbl of labels as any[]) {
                if ((visibleIndex - noteLabelStartNote) % noteLabelInterval !== 0) lbl.setOpacity?.(0);
                else {
                    lbl.text && (lbl.font = `${noteLabelFontWeight} ${noteLabelFontSize}px ${noteLabelFontFamily}`);
                    lbl.color = noteLabelFontColor;
                    lbl.setOpacity?.(noteLabelOpacity);
                    lbl.x = pianoWidth + noteLabelOffsetX;
                    lbl.y += noteLabelOffsetY;
                }
                visibleIndex++;
            }
            renderObjects.push(...labels);
        }

        if (showBeatLabels) {
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(
                effectiveTime,
                timeUnitBars
            );
            const labels = this._createBeatLabels(windowStart, windowEnd, beatsPerBar, pianoWidth, rollWidth);
            (labels as any[]).forEach((lbl) => {
                lbl.font = `${beatLabelFontWeight} ${beatLabelFontSize}px ${beatLabelFontFamily}`;
                lbl.color = beatLabelFontColor;
                lbl.x += beatLabelOffsetX;
                lbl.y += beatLabelOffsetY;
                lbl.setOpacity?.(beatLabelOpacity);
            });
            renderObjects.push(...labels);
        }

        if (showPlayhead) {
            const ph = this._createStaticPlayhead(
                pianoWidth,
                rollWidth,
                (maxNote - minNote + 1) * noteHeight,
                playheadLineWidth,
                playheadColor,
                playheadPosition
            );
            (ph as any[]).forEach((l) => l.setOpacity?.(playheadOpacity));
            renderObjects.push(...ph);
        }

        return renderObjects;
    }

    private async _handleMIDIFileConfig(midiFileData: File | null): Promise<void> {
        if (!midiFileData) return;
        if (midiFileData instanceof File) await this._loadMIDIFile(midiFileData);
    }

    private async _loadMIDIFile(file: File): Promise<void> {
        try {
            const resetMacroValues = this._currentMidiFile !== file;
            await this.midiManager.loadMidiFile(file, resetMacroValues);

            const notes = this.midiManager.getNotes();
            if (Array.isArray(notes) && notes.length > 0) {
                const noteValues = notes.map((n: any) => n.note).filter((v: any) => typeof v === 'number');
                if (noteValues.length > 0) {
                    const actualMin = Math.max(0, Math.min(...noteValues));
                    const actualMax = Math.min(127, Math.max(...noteValues));
                    const minBinding = this.getBinding('minNote');
                    const maxBinding = this.getBinding('maxNote');
                    if (minBinding instanceof ConstantBinding) this.setProperty('minNote', actualMin);
                    if (maxBinding instanceof ConstantBinding) this.setProperty('maxNote', actualMax);
                }
            }
            this._dispatchChangeEvent();
            if (typeof window !== 'undefined') {
                const vis: any = (window as any).debugVisualizer;
                if (vis && typeof vis.invalidateRender === 'function') vis.invalidateRender();
            }
        } catch (err) {
            console.error(`Failed to load MIDI file for ${this.id}:`, err);
        }
    }

    private _createNoteGridLines(
        minNote: number,
        maxNote: number,
        pianoWidth: number,
        rollWidth: number,
        noteHeight: number
    ): RenderObject[] {
        const lines: RenderObject[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;
        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - (note - minNote + 1) * noteHeight;
            lines.push(new Line(pianoWidth, y, pianoWidth + rollWidth, y, '#333333', 1));
        }
        return lines;
    }

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
            const isBar = b.isBarStart;
            lines.push(new Line(x, 0, x, totalHeight, isBar ? '#666666' : '#444444', isBar ? 2 : 1));
        }
        return lines;
    }

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
            labels.push(new Text(pianoWidth - 10, y, noteName, '10px Arial', '#ffffff', 'right', 'middle'));
        }
        return labels;
    }

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
            labels.push(new Text(x + 5, -5, `Bar ${b.barNumber}`, '12px Arial', '#ffffff', 'left', 'bottom'));
        }
        return labels;
    }

    private _createStaticPlayhead(
        pianoWidth: number,
        rollWidth: number,
        totalHeight: number,
        lineWidth: number,
        playheadColor: string,
        playheadPosition: number
    ): RenderObject[] {
        const x = pianoWidth + rollWidth * playheadPosition;
        const playhead = Line.createPlayhead
            ? Line.createPlayhead(x, 0, totalHeight, playheadColor, lineWidth)
            : new Line(x, 0, x, totalHeight, playheadColor, lineWidth);
        return [playhead];
    }

    private _dispatchChangeEvent(): void {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('sceneElementChanged', { detail: { elementId: this.id } }));
        }
    }

    private _setupMIDIFileListener(): void {
        globalMacroManager.addListener((eventType: any, data: any) => {
            if (eventType === 'macroValueChanged' && data.name === 'midiFile') {
                if (this.isBoundToMacro('midiFile', 'midiFile')) {
                    const file = this.getMidiFile();
                    if (file) this._handleMIDIFileConfig(file);
                }
            }
        });
    }

    // Convenience getters/setters mirroring TimeUnitPianoRoll
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
    getAnimationType(): string {
        return this.getProperty<string>('animationType');
    }
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
        return this.midiManager.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
    }
    getMidiFile(): File | null {
        return this.getProperty<File>('midiFile');
    }
    setMidiFile(file: File | null): this {
        this.setProperty('midiFile', file);
        return this;
    }
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
    getChannelColors(): string[] {
        const colors: string[] = [];
        for (let i = 0; i < 16; i++) {
            colors.push(this.getProperty<string>(`channel${i}Color`) || '#ffffff');
        }
        return colors;
    }
}
