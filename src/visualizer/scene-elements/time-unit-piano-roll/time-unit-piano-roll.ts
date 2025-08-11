// TimeUnitPianoRoll scene element with Property Binding System
import { SceneElement } from '../base';
import { RenderObjectInterface, EnhancedConfigSchema } from '../../types.js';
import { Line, Text } from '../../render-objects/index.js';
import { AnimationController } from './animation-controller';
import { NoteBlock } from './note-block';
import { MidiManager } from '../../midi-manager';
import { debugLog } from '../../utils/debug-log.js';
import { globalMacroManager } from '../../macro-manager';
import { ConstantBinding } from '../../property-bindings';

export class TimeUnitPianoRollElement extends SceneElement {
    public midiManager: MidiManager;
    public animationController: AnimationController;
    private _currentMidiFile: File | null = null;
    private _midiMacroListener?: (eventType: 'macroValueChanged' | 'macroCreated' | 'macroDeleted' | 'macroAssigned' | 'macroUnassigned' | 'macrosImported', data: any) => void;

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
                {
                    id: 'noteColors',
                    label: 'Note Colors (per MIDI channel)',
                    collapsed: true,
                    properties: [
                        { key: 'channel0Color', type: 'color', label: 'Channel 1', default: '#ff6b6b', description: 'Color for MIDI channel 1' },
                        { key: 'channel1Color', type: 'color', label: 'Channel 2', default: '#4ecdc4', description: 'Color for MIDI channel 2' },
                        { key: 'channel2Color', type: 'color', label: 'Channel 3', default: '#45b7d1', description: 'Color for MIDI channel 3' },
                        { key: 'channel3Color', type: 'color', label: 'Channel 4', default: '#96ceb4', description: 'Color for MIDI channel 4' },
                        { key: 'channel4Color', type: 'color', label: 'Channel 5', default: '#feca57', description: 'Color for MIDI channel 5' },
                        { key: 'channel5Color', type: 'color', label: 'Channel 6', default: '#ff9ff3', description: 'Color for MIDI channel 6' },
                        { key: 'channel6Color', type: 'color', label: 'Channel 7', default: '#54a0ff', description: 'Color for MIDI channel 7' },
                        { key: 'channel7Color', type: 'color', label: 'Channel 8', default: '#5f27cd', description: 'Color for MIDI channel 8' },
                        { key: 'channel8Color', type: 'color', label: 'Channel 9', default: '#00d2d3', description: 'Color for MIDI channel 9' },
                        { key: 'channel9Color', type: 'color', label: 'Channel 10', default: '#ff9f43', description: 'Color for MIDI channel 10' },
                        { key: 'channel10Color', type: 'color', label: 'Channel 11', default: '#10ac84', description: 'Color for MIDI channel 11' },
                        { key: 'channel11Color', type: 'color', label: 'Channel 12', default: '#ee5a24', description: 'Color for MIDI channel 12' },
                        { key: 'channel12Color', type: 'color', label: 'Channel 13', default: '#0984e3', description: 'Color for MIDI channel 13' },
                        { key: 'channel13Color', type: 'color', label: 'Channel 14', default: '#a29bfe', description: 'Color for MIDI channel 14' },
                        { key: 'channel14Color', type: 'color', label: 'Channel 15', default: '#fd79a8', description: 'Color for MIDI channel 15' },
                        { key: 'channel15Color', type: 'color', label: 'Channel 16', default: '#e17055', description: 'Color for MIDI channel 16' }
                    ]
                },
                {
                    id: 'timing',
                    label: 'Timing',
                    collapsed: true,
                    properties: [
                        { key: 'bpm', type: 'number', label: 'BPM (Tempo)', default: 120, min: 20, max: 300, step: 0.1, description: 'Beats per minute for this element' },
                        { key: 'beatsPerBar', type: 'number', label: 'Beats per Bar', default: 4, min: 1, max: 16, step: 1, description: 'Number of beats in each bar for this element' }
                    ]
                },
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        { key: 'midiFile', type: 'file', label: 'MIDI File', accept: '.mid,.midi', default: null, description: 'Upload a MIDI file specifically for this piano roll element' }
                    ]
                },
                {
                    id: 'layout',
                    label: 'Layout',
                    collapsed: false,
                    properties: [
                        { key: 'pianoWidth', type: 'number', label: 'Piano Width', default: 120, min: 80, max: 300, step: 10, description: 'Width of the piano keys section in pixels' },
                        { key: 'rollWidth', type: 'number', label: 'Roll Width', default: 800, min: 200, max: 2000, step: 50, description: 'Width of the roll section in pixels (auto-calculated if empty)' },
                        { key: 'noteHeight', type: 'number', label: 'Note Height', default: 20, min: 4, max: 20, step: 1, description: 'Height of MIDI note blocks in pixels' },
                        { key: 'timeUnitBars', type: 'number', label: 'Time Unit (Bars)', default: 1, min: 1, max: 8, step: 1, description: 'Number of bars shown in each time unit' },
                        { key: 'minNote', type: 'number', label: 'Minimum Note', default: 30, min: 0, max: 127, step: 1, description: 'Lowest MIDI note to display (21 = A0)' },
                        { key: 'maxNote', type: 'number', label: 'Maximum Note', default: 72, min: 0, max: 127, step: 1, description: 'Highest MIDI note to display (108 = C8)' },
                    ]
                },
                {
                    id: 'display',
                    label: 'Display',
                    collapsed: false,
                    properties: [
                        { key: 'showNoteGrid', type: 'boolean', label: 'Show Note Grid', default: true, description: 'Show horizontal grid lines for notes' },
                        { key: 'showNoteLabels', type: 'boolean', label: 'Show Note Labels', default: true, description: 'Show note names (C, D, E, etc.)' },
                        { key: 'showNotes', type: 'boolean', label: 'Show Notes', default: true, description: 'Show MIDI note blocks' },
                        { key: 'showBeatGrid', type: 'boolean', label: 'Show Beat Grid', default: true, description: 'Show vertical beat grid lines' },
                        { key: 'showBeatLabels', type: 'boolean', label: 'Show Beat Labels', default: true, description: 'Show beat and bar labels' }
                    ]
                },
                {
                    id: 'animation',
                    label: 'Animation',
                    collapsed: false,
                    properties: [
                        { key: 'animationType', type: 'select', label: 'Animation Type', default: 'expand', options: [
                            { value: 'fade', label: 'Fade In/Out' },
                            { value: 'slide', label: 'Slide' },
                            { value: 'scale', label: 'Scale' },
                            { value: 'expand', label: 'Expand' },
                            { value: 'debug', label: 'Debug'},
                            { value: 'none', label: 'No Animation' }
                        ], description: 'Type of animation for note appearance' },
                        { key: 'animationSpeed', type: 'number', label: 'Animation Speed', default: 1.0, min: 0.1, max: 5.0, step: 0.1, description: 'Speed multiplier for animations' },
                        { key: 'animationDuration', type: 'number', label: 'Animation Duration', default: 0.5, min: 0.1, max: 2.0, step: 0.1, description: 'Duration of note animations in seconds' }
                    ]
                },
                {
                    id: 'playhead',
                    label: 'Playhead',
                    collapsed: true,
                    properties: [
                        { key: 'playheadLineWidth', type: 'number', label: 'Playhead Line Width', default: 2, min: 1, max: 10, step: 1, description: 'Width of the playhead line in pixels' },
                        { key: 'showPlayhead', type: 'boolean', label: 'Show Playhead', default: true, description: 'Show the playhead line' }
                    ]
                }
            ]
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        const renderObjects: RenderObjectInterface[] = [];

        // Get current property values through bindings
        const bpm = this.getProperty<number>('bpm');
        const beatsPerBar = this.getProperty<number>('beatsPerBar');
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
            targetTime,
            timeUnitBars
        );
        
        // Create render objects for the piano roll
        debugLog(`[_buildRenderObjects] ${showNotes ? 'Rendering notes' : 'Skipping notes'} for target time ${targetTime} with ${windowedNoteBlocks.length} windowed note segments`);
        if (showNotes && windowedNoteBlocks.length > 0) {
            const noteBlocks = windowedNoteBlocks; // already NoteBlock instances with window metadata
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { noteHeight, minNote, maxNote, pianoWidth, rollWidth },
                noteBlocks,
                targetTime
            );
            debugLog(`[_buildRenderObjects] Created ${animatedRenderObjects.length} animated note blocks`);
            renderObjects.push(...animatedRenderObjects);
        }

        // Add grid lines
        if (showNoteGrid) {
            renderObjects.push(...this._createNoteGridLines(minNote, maxNote, pianoWidth, rollWidth || 800, noteHeight));
        }

        // Add beat grid (tempo-aware)
        if (showBeatGrid) {
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(targetTime, timeUnitBars);
            renderObjects.push(...this._createBeatGridLines(windowStart, windowEnd, beatsPerBar, pianoWidth, rollWidth || 800, (maxNote - minNote + 1) * noteHeight));
        }

        // Add note labels
        if (showNoteLabels) {
            renderObjects.push(...this._createNoteLabels(minNote, maxNote, pianoWidth, noteHeight));
        }

        // Add beat labels (tempo-aware)
        if (showBeatLabels) {
            const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(targetTime, timeUnitBars);
            renderObjects.push(...this._createBeatLabels(windowStart, windowEnd, beatsPerBar, pianoWidth, rollWidth || 800));
        }

        // Add playhead
        if (showPlayhead) {
            renderObjects.push(...this._createPlayhead(config, targetTime, pianoWidth, rollWidth || 800, (maxNote - minNote + 1) * noteHeight, playheadLineWidth));
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
                bpm: this.midiManager.timingManager.bpm
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
    private _createNoteGridLines(minNote: number, maxNote: number, pianoWidth: number, rollWidth: number, noteHeight: number): RenderObjectInterface[] {
        const lines: RenderObjectInterface[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;

        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - ((note - minNote + 1) * noteHeight);
            const line = new Line(pianoWidth, y, pianoWidth + rollWidth, y, '#333333', 1);
            lines.push(line);
        }

        return lines;
    }

    /**
     * Create vertical grid lines for beats
     */
    private _createBeatGridLines(windowStart: number, windowEnd: number, beatsPerBar: number, pianoWidth: number, rollWidth: number, totalHeight: number): RenderObjectInterface[] {
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
    private _createNoteLabels(minNote: number, maxNote: number, pianoWidth: number, noteHeight: number): RenderObjectInterface[] {
        const labels: RenderObjectInterface[] = [];
        const totalHeight = (maxNote - minNote + 1) * noteHeight;

        for (let note = minNote; note <= maxNote; note++) {
            const y = totalHeight - ((note - minNote + 0.5) * noteHeight);
            const noteName = this.midiManager.getNoteName(note);
            
            const label = new Text(pianoWidth - 10, y, noteName, '10px Arial', '#ffffff', 'right', 'middle');
            labels.push(label);
        }

        return labels;
    }

    /**
     * Create beat and bar labels
     */
    private _createBeatLabels(windowStart: number, windowEnd: number, beatsPerBar: number, pianoWidth: number, rollWidth: number): RenderObjectInterface[] {
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
    private _createPlayhead(config: any, targetTime: number, pianoWidth: number, rollWidth: number, totalHeight: number, lineWidth: number): RenderObjectInterface[] {
        const playheadObjects: RenderObjectInterface[] = [];
        
        // Get playhead color from config (defaults from visualizer core)
        const playheadColor = config.playheadColor || '#ff6b6b';
        
        // Calculate playhead position
    const { start: windowStart, end: windowEnd } = this.midiManager.timingManager.getTimeUnitWindow(targetTime, this.getTimeUnitBars());
    const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);
    const playheadPosition = ((targetTime - windowStart) / timeUnitInSeconds) * rollWidth;
        const playheadX = pianoWidth + playheadPosition;

        // Create playhead line using Line.createPlayhead if available, otherwise use regular Line
        if (Line.createPlayhead) {
            const playhead = Line.createPlayhead(
                playheadX,
                0,
                totalHeight,
                playheadColor,
                lineWidth
            );
            playheadObjects.push(playhead);
        } else {
            // Fallback to regular line
            const playhead = new Line(playheadX, 0, playheadX, totalHeight, playheadColor, lineWidth);
            playheadObjects.push(playhead);
        }

        return playheadObjects;
    }

    // Note name resolution handled by MidiManager

    /**
     * Dispatch a change event to trigger re-renders
     */
    private _dispatchChangeEvent(): void {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('sceneElementChanged', {
                detail: { elementId: this.id }
            }));
        }
    }

    /**
     * Set up listener specifically for MIDI file changes to immediately process file
     */
    private _setupMIDIFileListener(): void {
        this._midiMacroListener = (eventType: 'macroValueChanged' | 'macroCreated' | 'macroDeleted' | 'macroAssigned' | 'macroUnassigned' | 'macrosImported', data: any) => {
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

    getAnimationSpeed(): number {
        return this.getProperty<number>('animationSpeed');
    }

    getAnimationDuration(): number {
        return this.getProperty<number>('animationDuration') || 0.5;
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
