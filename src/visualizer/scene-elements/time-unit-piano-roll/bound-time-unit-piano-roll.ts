// TimeUnitPianoRoll scene element with Property Binding System
import { BoundSceneElement } from '../bound-base';
import { RenderObjectInterface, ConfigSchema } from '../../types.js';
import { Line, Text } from '../../render-objects/index.js';
import { BoundAnimationController } from './bound-animation-controller.js';
import { LocalTimingManager } from '../../local-timing-manager.js';
import { NoteBlock } from '../../note-block';
import { globalMacroManager } from '../../macro-manager';

export class BoundTimeUnitPianoRollElement extends BoundSceneElement {
    public timingManager: LocalTimingManager;
    public animationController: BoundAnimationController;
    private _currentMidiFile: File | null = null;
    private channelColors: string[] = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
        '#00d2d3', '#ff9f43', '#10ac84', '#ee5a24', '#0984e3', '#a29bfe', '#fd79a8', '#e17055'
    ];

    constructor(id: string = 'boundTimeUnitPianoRoll', config: { [key: string]: any } = {}) {
        super('boundTimeUnitPianoRoll', id, config);
        
        // Initialize timing manager with this element's ID
        this.timingManager = new LocalTimingManager(this.id as any);
        
        // Initialize bound animation controller
        this.animationController = new BoundAnimationController(this);
        
        // Set up specific MIDI file change handling
        this._setupMIDIFileListener();
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Bound Time Unit Piano Roll',
            description: 'Complete MIDI visualization with property bindings',
            category: 'complete',
            properties: {
                ...super.getConfigSchema().properties,

                // Local timing properties with binding support
                bpm: {
                    type: 'number',
                    label: 'BPM (Tempo)',
                    default: 120,
                    min: 20,
                    max: 300,
                    step: 0.1,
                    description: 'Beats per minute for this element'
                },
                beatsPerBar: {
                    type: 'number',
                    label: 'Beats per Bar',
                    default: 4,
                    min: 1,
                    max: 16,
                    step: 1,
                    description: 'Number of beats in each bar for this element'
                },

                // MIDI file input for this element with binding support
                midiFile: {
                    type: 'file',
                    label: 'MIDI File',
                    accept: '.mid,.midi',
                    default: null,
                    description: 'Upload a MIDI file specifically for this piano roll element'
                },

                // Time unit properties
                timeUnitBars: {
                    type: 'number',
                    label: 'Time Unit (Bars)',
                    default: 1,
                    min: 1,
                    max: 8,
                    step: 1,
                    description: 'Number of bars shown in each time unit'
                },

                // Layout properties
                pianoWidth: {
                    type: 'number',
                    label: 'Piano Width',
                    default: 120,
                    min: 80,
                    max: 300,
                    step: 10,
                    description: 'Width of the piano keys section in pixels'
                },
                rollWidth: {
                    type: 'number',
                    label: 'Roll Width',
                    default: 800,
                    min: 200,
                    max: 2000,
                    step: 50,
                    description: 'Width of the roll section in pixels (auto-calculated if empty)'
                },

                // Piano roll properties
                showNoteGrid: {
                    type: 'boolean',
                    label: 'Show Note Grid',
                    default: true,
                    description: 'Show horizontal grid lines for notes'
                },
                showNoteLabels: {
                    type: 'boolean',
                    label: 'Show Note Labels',
                    default: true,
                    description: 'Show note names (C, D, E, etc.)'
                },
                showNotes: {
                    type: 'boolean',
                    label: 'Show Notes',
                    default: true,
                    description: 'Show MIDI note blocks'
                },
                minNote: {
                    type: 'number',
                    label: 'Minimum Note',
                    default: 30, // Changed from 21 to 60 (middle C) for debugging
                    min: 0,
                    max: 127,
                    step: 1,
                    description: 'Lowest MIDI note to display (21 = A0)'
                },
                maxNote: {
                    type: 'number',
                    label: 'Maximum Note',
                    default: 72, // Changed from 108 to 72 (C5) for debugging  
                    min: 0,
                    max: 127,
                    step: 1,
                    description: 'Highest MIDI note to display (108 = C8)'
                },

                // Beat display properties
                showBeatGrid: {
                    type: 'boolean',
                    label: 'Show Beat Grid',
                    default: true,
                    description: 'Show vertical beat grid lines'
                },
                showBeatLabels: {
                    type: 'boolean',
                    label: 'Show Beat Labels',
                    default: true,
                    description: 'Show beat and bar labels'
                },

                // Note appearance
                noteColor: {
                    type: 'color',
                    label: 'Note Color',
                    default: '#ff6b6b',
                    description: 'Default color for MIDI notes'
                },
                noteHeight: {
                    type: 'number',
                    label: 'Note Height',
                    default: 20, // Changed from 8 to 20 for debugging
                    min: 4,
                    max: 20,
                    step: 1,
                    description: 'Height of MIDI note blocks in pixels'
                },

                // Animation properties
                animationType: {
                    type: 'select',
                    label: 'Animation Type',
                    default: 'none', // Changed from 'fade' to 'none' for debugging
                    options: [
                        { value: 'fade', label: 'Fade In/Out' },
                        { value: 'slide', label: 'Slide' },
                        { value: 'scale', label: 'Scale' },
                        { value: 'none', label: 'No Animation' }
                    ],
                    description: 'Type of animation for note appearance'
                },
                animationSpeed: {
                    type: 'number',
                    label: 'Animation Speed',
                    default: 1.0,
                    min: 0.1,
                    max: 5.0,
                    step: 0.1,
                    description: 'Speed multiplier for animations'
                },
                animationDuration: {
                    type: 'number',
                    label: 'Animation Duration',
                    default: 0.5,
                    min: 0.1,
                    max: 2.0,
                    step: 0.1,
                    description: 'Duration of note animations in seconds'
                },

                // Playhead properties
                playheadLineWidth: {
                    type: 'number',
                    label: 'Playhead Line Width',
                    default: 2,
                    min: 1,
                    max: 10,
                    step: 1,
                    description: 'Width of the playhead line in pixels'
                },
                showPlayhead: {
                    type: 'boolean',
                    label: 'Show Playhead',
                    default: true,
                    description: 'Show the playhead line'
                }
            }
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
        const noteColor = this.getProperty<string>('noteColor');
        const noteHeight = this.getProperty<number>('noteHeight');
        const animationType = this.getProperty<string>('animationType');
        const showPlayhead = this.getProperty<boolean>('showPlayhead');
        const playheadLineWidth = this.getProperty<number>('playheadLineWidth');

        // Handle MIDI file changes
        const midiFile = this.getProperty<File>('midiFile');
        if (midiFile !== this._currentMidiFile) {
            this._handleMIDIFileConfig(midiFile);
            this._currentMidiFile = midiFile;
        }

        // Update timing manager with current values
        this.timingManager.setBPM(bpm);
        this.timingManager.setBeatsPerBar(beatsPerBar);

        // Get notes for the current time window
        const notesInTimeUnit = this.timingManager.getNotesInTimeUnit(targetTime);
        
        // Create render objects for the piano roll
        console.log(`[_buildRenderObjects] ${showNotes ? 'Rendering notes' : 'Skipping notes'} for target time ${targetTime} with ${notesInTimeUnit.length} notes`);
        if (showNotes && notesInTimeUnit.length > 0) {
            const noteBlocks = this._createNoteBlocks(notesInTimeUnit, targetTime);
            console.log(`[_buildRenderObjects] Created ${noteBlocks.length} note blocks for rendering`);
            const animatedRenderObjects = this.animationController.buildNoteRenderObjects(
                { animationType, noteColor, noteHeight, minNote, maxNote, pianoWidth, rollWidth },
                noteBlocks,
                targetTime
            );
            console.log(`[_buildRenderObjects] Created ${animatedRenderObjects.length} animated note blocks`);
            console.log(animatedRenderObjects);
            renderObjects.push(...animatedRenderObjects);
        }

        // Add grid lines
        if (showNoteGrid) {
            renderObjects.push(...this._createNoteGridLines(minNote, maxNote, pianoWidth, rollWidth || 800, noteHeight));
        }

        // Add beat grid
        if (showBeatGrid) {
            renderObjects.push(...this._createBeatGridLines(timeUnitBars, beatsPerBar, pianoWidth, rollWidth || 800, (maxNote - minNote + 1) * noteHeight));
        }

        // Add note labels
        if (showNoteLabels) {
            renderObjects.push(...this._createNoteLabels(minNote, maxNote, pianoWidth, noteHeight));
        }

        // Add beat labels
        if (showBeatLabels) {
            renderObjects.push(...this._createBeatLabels(timeUnitBars, beatsPerBar, pianoWidth, rollWidth || 800));
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

            // Import MIDIParser dynamically to avoid circular imports
            const { MIDIParser } = await import('../../midi-parser');
            const parser = new MIDIParser();

            // Parse the MIDI file
            const midiData = await parser.parseMIDIFile(file);

            // Create notes array from events
            const notes: any[] = [];
            const noteMap = new Map();

            // Process events to create note objects
            for (const event of midiData.events) {
                const noteKey = `${event.note}_${event.channel}`;

                if (event.type === 'noteOn') {
                    noteMap.set(noteKey, {
                        note: event.note,
                        channel: event.channel,
                        velocity: event.velocity,
                        startTime: event.time
                    });
                } else if (event.type === 'noteOff') {
                    const noteOn = noteMap.get(noteKey);
                    if (noteOn) {
                        notes.push({
                            ...noteOn,
                            endTime: event.time,
                            duration: event.time - noteOn.startTime
                        });
                        noteMap.delete(noteKey);
                    }
                }
            }

            // Handle any notes that didn't get a noteOff event
            noteMap.forEach((note) => {
                notes.push({
                    ...note,
                    endTime: note.startTime + 1.0,
                    duration: 1.0
                });
            });

            // Load the data into our local timing manager
            const resetMacroValues = this._currentMidiFile !== file;
            this.timingManager.loadMIDIData(midiData, notes, resetMacroValues);

            console.log(`Successfully loaded MIDI file for bound element ${this.id}:`, {
                duration: this.timingManager.getDuration(),
                noteCount: notes.length,
                bpm: this.timingManager.bpm
            });

            // Trigger a re-render
            this._dispatchChangeEvent();

        } catch (error) {
            console.error(`Failed to load MIDI file for bound element ${this.id}:`, error);
        }
    }

    /**
     * Create note blocks for rendering
     */
    private _createNoteBlocks(notes: any[], targetTime: number): NoteBlock[] {
        return notes.map(note => new NoteBlock(
            note.note,
            note.velocity,
            note.startTime,
            note.endTime,
            note.channel || 0
        ));
    }

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
    private _createBeatGridLines(timeUnitBars: number, beatsPerBar: number, pianoWidth: number, rollWidth: number, totalHeight: number): RenderObjectInterface[] {
        const lines: RenderObjectInterface[] = [];
        const totalBeats = timeUnitBars * beatsPerBar;
        const beatWidth = rollWidth / totalBeats;

        for (let beat = 0; beat <= totalBeats; beat++) {
            const x = pianoWidth + (beat * beatWidth);
            const strokeColor = beat % beatsPerBar === 0 ? '#666666' : '#444444';
            const strokeWidth = beat % beatsPerBar === 0 ? 2 : 1;
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
            const noteName = this._getNoteName(note);
            
            const label = new Text(pianoWidth - 10, y, noteName, '10px Arial', '#ffffff', 'right', 'middle');
            labels.push(label);
        }

        return labels;
    }

    /**
     * Create beat and bar labels
     */
    private _createBeatLabels(timeUnitBars: number, beatsPerBar: number, pianoWidth: number, rollWidth: number): RenderObjectInterface[] {
        const labels: RenderObjectInterface[] = [];
        const totalBeats = timeUnitBars * beatsPerBar;
        const beatWidth = rollWidth / totalBeats;

        for (let beat = 0; beat <= totalBeats; beat++) {
            if (beat % beatsPerBar === 0) {
                const bar = Math.floor(beat / beatsPerBar) + 1;
                const x = pianoWidth + (beat * beatWidth);
                
                const label = new Text(x + 5, -5, `Bar ${bar}`, '12px Arial', '#ffffff', 'left', 'bottom');
                labels.push(label);
            }
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
        const timeUnitInSeconds = this.getTimeUnit();
        const windowStart = Math.floor(targetTime / timeUnitInSeconds) * timeUnitInSeconds;
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

    /**
     * Get the note name (C, C#, D, etc.) for a MIDI note number
     */
    private _getNoteName(midiNote: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = noteNames[midiNote % 12];
        return `${noteName}${octave}`;
    }

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
        globalMacroManager.addListener((eventType: 'macroValueChanged' | 'macroCreated' | 'macroDeleted' | 'macroAssigned' | 'macroUnassigned' | 'macrosImported', data: any) => {
            if (eventType === 'macroValueChanged' && data.name === 'midiFile') {
                // Check if this element is bound to the midiFile macro
                if (this.isBoundToMacro('midiFile', 'midiFile')) {
                    console.log(`[MIDI File Listener] Processing MIDI file change for element ${this.id}`);
                    // Get the new MIDI file and process it immediately
                    const newMidiFile = this.getProperty<File>('midiFile');
                    if (newMidiFile !== this._currentMidiFile) {
                        this._handleMIDIFileConfig(newMidiFile);
                        this._currentMidiFile = newMidiFile;
                    }
                }
            }
        });
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

    getTimeUnitBars(): number {
        return this.getProperty<number>('timeUnitBars');
    }

    setTimeUnitBars(bars: number): this {
        this.setProperty('timeUnitBars', bars);
        return this;
    }

    getTimeUnit(): number {
        return this.timingManager.getTimeUnitDuration(this.getTimeUnitBars());
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
        return this.channelColors;
    }

    /**
     * Load MIDI data directly (for programmatic use)
     */
    loadMIDIData(midiData: any, notes: any[]): this {
        this.timingManager.loadMIDIData(midiData, notes);
        this._dispatchChangeEvent();
        return this;
    }
}
