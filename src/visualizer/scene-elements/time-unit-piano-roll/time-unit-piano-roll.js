// TimeUnitPianoRoll scene element - consolidates playhead, beat display, and piano roll
import { SceneElement } from '../base.js';
import { Line, Text, Rectangle } from '../../render-objects/index.js';
import { AnimationController } from './animation-controller.js';
import { globalTimingManager } from '../../../core/timing-manager';
import { LocalTimingManager } from '../../../core/local-timing-manager.js';
import { globalMacroManager } from '../../../core/macro-manager';
import { NoteBlock } from '../../../core/note-block';

export class TimeUnitPianoRollElement extends SceneElement {
    constructor(id = 'timeUnitPianoRoll', config = {}, timingManager = null) {
        super('timeUnitPianoRoll', id, config);

        // Use local timing manager by default for independent timing control
        this.timingManager = new LocalTimingManager(id);

        // Legacy support - if a timing manager is provided, copy its configuration
        if (timingManager) {
            this.timingManager.applyConfig(timingManager.getConfig ? timingManager.getConfig() : {
                bpm: timingManager.bpm,
                beatsPerBar: timingManager.beatsPerBar,
                timeSignature: timingManager.timeSignature,
                ticksPerQuarter: timingManager.ticksPerQuarter,
                tempo: timingManager.tempo
            });
        }

        // Time unit settings (now managed by TimingManager)
        this.timeUnitBars = 1; // Number of bars to show

        // Piano roll settings
        this.showNoteGrid = true;
        this.showNoteLabels = true;
        this.showNotes = true;
        this.minNote = 21; // A0
        this.maxNote = 108; // C8

        // Beat display settings
        this.showBeatGrid = true;
        this.showBeatLabels = true;
        this.showBarIndicator = true;
        this.beatFontFamily = 'Arial';
        this.beatFontWeight = '400';

        // Playhead settings
        this.playheadLineWidth = 2;

        // Animation settings
        this.animationType = 'fade';
        this.animationSpeed = 1.0;
        this.animationDuration = 0.5;

        // Channel colors (16 MIDI channels)
        this.channelColors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
            '#00d2d3', '#ff9f43', '#10ac84', '#ee5a24', '#0984e3', '#a29bfe', '#fd79a8', '#e17055'
        ];

        // Animation controller
        this.animationController = new AnimationController(this);

        this._applyConfig();
    }

    static getConfigSchema() {
        return {
            name: 'Time Unit Piano Roll',
            description: 'Complete MIDI visualization with time units, piano roll, beats, and playhead',
            category: 'complete',
            properties: {
                ...super.getConfigSchema().properties,

                // Local timing properties
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

                // MIDI file input for this element
                midiFile: {
                    type: 'file',
                    label: 'MIDI File',
                    accept: '.mid,.midi',
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
                    default: 21,
                    min: 0,
                    max: 127,
                    step: 1,
                    description: 'Lowest MIDI note to display (21 = A0)'
                },
                maxNote: {
                    type: 'number',
                    label: 'Maximum Note',
                    default: 108,
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
                showBarIndicator: {
                    type: 'boolean',
                    label: 'Show Bar Indicator',
                    default: true,
                    description: 'Show current bar indicator in top right'
                },
                beatFontFamily: {
                    type: 'select',
                    label: 'Beat Font Family',
                    default: 'Arial',
                    options: [
                        { value: 'Arial', label: 'Arial' },
                        { value: 'Helvetica', label: 'Helvetica' },
                        { value: 'Times New Roman', label: 'Times New Roman' },
                        { value: 'Georgia', label: 'Georgia' },
                        { value: 'Verdana', label: 'Verdana' },
                        { value: 'Trebuchet MS', label: 'Trebuchet MS' },
                        { value: 'Impact', label: 'Impact' },
                        { value: 'Courier New', label: 'Courier New' }
                    ],
                    description: 'Font family for the beat labels'
                },
                beatFontWeight: {
                    type: 'select',
                    label: 'Beat Font Weight',
                    default: '400',
                    options: [
                        { value: 'normal', label: 'Normal' },
                        { value: 'bold', label: 'Bold' },
                        { value: '100', label: 'Thin' },
                        { value: '300', label: 'Light' },
                        { value: '400', label: 'Regular' },
                        { value: '500', label: 'Medium' },
                        { value: '700', label: 'Bold' },
                        { value: '900', label: 'Black' }
                    ],
                    description: 'Font weight for the beat labels'
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

                // Animation properties
                animationType: {
                    type: 'select',
                    label: 'Animation Type',
                    default: 'fade',
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
                }
            }
        };
    }

    _applyConfig() {
        super._applyConfig();

        // Local timing settings
        if (this.config.bpm !== undefined) {
            this.timingManager.setBPM(this.config.bpm);
        }
        if (this.config.beatsPerBar !== undefined) {
            this.timingManager.setBeatsPerBar(this.config.beatsPerBar);
        }

        // MIDI file handling
        if (this.config.midiFile !== undefined) {
            this._handleMIDIFileConfig(this.config.midiFile);
        }

        // Time unit settings - update TimingManager
        if (this.config.timeUnitBars !== undefined) {
            this.timeUnitBars = this.config.timeUnitBars;
        }

        // Piano roll settings
        if (this.config.showNoteGrid !== undefined) {
            this.showNoteGrid = this.config.showNoteGrid;
        }
        if (this.config.showNoteLabels !== undefined) {
            this.showNoteLabels = this.config.showNoteLabels;
        }
        if (this.config.showNotes !== undefined) {
            this.showNotes = this.config.showNotes;
        }
        if (this.config.minNote !== undefined) {
            this.minNote = this.config.minNote;
        }
        if (this.config.maxNote !== undefined) {
            this.maxNote = this.config.maxNote;
        }

        // Beat display settings
        if (this.config.showBeatGrid !== undefined) {
            this.showBeatGrid = this.config.showBeatGrid;
        }
        if (this.config.showBeatLabels !== undefined) {
            this.showBeatLabels = this.config.showBeatLabels;
        }
        if (this.config.showBarIndicator !== undefined) {
            this.showBarIndicator = this.config.showBarIndicator;
        }
        if (this.config.beatFontFamily !== undefined) {
            this.beatFontFamily = this.config.beatFontFamily;
        }
        if (this.config.beatFontWeight !== undefined) {
            this.beatFontWeight = this.config.beatFontWeight;
        }

        // Playhead settings
        if (this.config.playheadLineWidth !== undefined) {
            this.playheadLineWidth = this.config.playheadLineWidth;
        }

        // Animation settings
        if (this.config.animationType !== undefined) {
            this.animationType = this.config.animationType;
        }
        if (this.config.animationSpeed !== undefined) {
            this.animationSpeed = this.config.animationSpeed;
        }
        if (this.config.animationDuration !== undefined) {
            this.animationDuration = this.config.animationDuration;
        }

        // Update animation controller if it exists
        if (this.animationController) {
            this.animationController.updateSettings(this);
        }
    }

    updateTimeUnit() {
        // Time unit is now calculated by TimingManager
        // This method is kept for compatibility but delegates to TimingManager
        this.timingManager.logConfiguration();
    }

    getTimeUnit() {
        return this.timingManager.getTimeUnitDuration(this.timeUnitBars);
    }

    buildRenderObjects(config, targetTime) {
        if (!this.visible) return [];

        const renderObjects = [];

        // Debug: Log timing values occasionally during playback
        if (config.isPlaying && Math.floor(targetTime) % 5 === 0 && Math.floor(targetTime * 10) % 10 === 0) { // Log every 5 seconds
            console.log(`TimeUnitPianoRoll (${this.id}) timing during playback:`, {
                localBPM: this.timingManager.bpm,
                localBeatsPerBar: this.timingManager.beatsPerBar,
                configBPM: config.bpm,
                configBeatsPerBar: config.beatsPerBar,
                targetTime: targetTime.toFixed(2)
            });
        }

        // Create local config with timing settings from local TimingManager
        const localConfig = {
            ...config,
            timeUnit: this.getTimeUnit(),
            timeUnitBars: this.timeUnitBars,
            beatsPerBar: this.timingManager.beatsPerBar,
            bpm: this.timingManager.bpm,
            targetTime: targetTime,
            // Override notes with local timing manager's notes
            notes: this._getNotesForTimeWindow(config, targetTime),
            duration: this.timingManager.getDuration() || config.duration
        };

        // Build piano roll elements
        if (this.showNotes || this.showNoteGrid || this.showNoteLabels) {
            const pianoRollObjects = this._buildPianoRoll(localConfig);
            renderObjects.push(...pianoRollObjects);
        }

        // Build beat display elements
        if (this.showBeatGrid || this.showBeatLabels || this.showBarIndicator) {
            const beatDisplayObjects = this._buildBeatDisplay(localConfig);
            renderObjects.push(...beatDisplayObjects);
        }

        // Build playhead
        const playheadObjects = this._buildPlayhead(localConfig);
        renderObjects.push(...playheadObjects);

        return renderObjects;
    }

    _buildPianoRoll(config) {
        const renderObjects = [];
        const { canvas, pianoWidth, rollWidth, fontFamily, fontWeight } = config;
        const { width, height } = canvas;

        // Calculate note range and dimensions using element properties
        const noteRange = { min: this.minNote, max: this.maxNote };
        const totalNotes = noteRange.max - noteRange.min + 1;
        const noteHeight = Math.max(2, (height - 100) / totalNotes);

        // Horizontal grid lines for notes
        if (this.showNoteGrid) {
            // Light grid lines for all notes
            for (let i = 0; i <= totalNotes; i++) {
                const y = i * noteHeight;
                const line = Line.createHorizontalLine(pianoWidth, width, y, 'rgba(255, 255, 255, 0.03)', 1);
                renderObjects.push(line);
            }

            // Stronger lines for C notes with labels
            for (let i = 0; i < totalNotes; i++) {
                const note = noteRange.min + i;
                if (note % 12 === 0) { // C notes
                    const y = (totalNotes - i - 1) * noteHeight;
                    const line = Line.createHorizontalLine(pianoWidth, width, y, 'rgba(255, 255, 255, 0.1)', 1);
                    renderObjects.push(line);

                    // Add note name label if enabled
                    if (this.showNoteLabels) {
                        const noteName = this._getNoteName(note);
                        const fontSize = 12;
                        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
                        const noteLabel = new Text(pianoWidth - 10, y, noteName, font, config.textTertiaryColor, 'right', 'middle');
                        renderObjects.push(noteLabel);
                    }
                }
            }
        }

        // Render notes using AnimationController
        if (this.showNotes) {
            // Create noteBlocks from local timing manager's notes
            const noteBlocks = this._createNoteBlocks(config, config.targetTime);

            const extendedConfig = {
                ...config,
                pianoWidth: pianoWidth,
                rollWidth: rollWidth,
                noteBlocks: noteBlocks
            };
            const noteRenderObjects = this.animationController.buildNoteRenderObjects(extendedConfig, noteRange, totalNotes, noteHeight);
            renderObjects.push(...noteRenderObjects);
        }

        return renderObjects;
    }

    _buildBeatDisplay(config) {
        const renderObjects = [];
        const { canvas, pianoWidth, rollWidth, duration } = config;
        const { width, height } = canvas;

        // Vertical grid lines for beats
        if (this.showBeatGrid) {
            const beatsInUnit = this.getBeatsPerBar() * this.timeUnitBars;
            for (let beat = 0; beat <= beatsInUnit; beat++) {
                const x = pianoWidth + (beat / beatsInUnit) * rollWidth;
                const line = Line.createVerticalLine(x, 0, height - 50, 'rgba(255, 255, 255, 0.1)', 1);
                renderObjects.push(line);
            }
        }

        // Beat labels and bar indicators
        if (this.showBeatLabels) {
            const timeUnitInSeconds = this.getTimeUnit();
            const currentBarNum = Math.floor(config.targetTime / timeUnitInSeconds) + 1;
            const windowStart = Math.floor(config.targetTime / timeUnitInSeconds) * timeUnitInSeconds;
            const beatsInUnit = this.getBeatsPerBar() * this.timeUnitBars;

            const fontSize = 12;
            const font = `${this.beatFontWeight} ${fontSize}px ${this.beatFontFamily}, sans-serif`;

            for (let beat = 0; beat <= beatsInUnit; beat++) {
                const x = pianoWidth + (beat / beatsInUnit) * rollWidth;
                const beatNum = (beat % this.getBeatsPerBar()) + 1;
                const barInUnit = Math.floor(beat / this.getBeatsPerBar()) + 1;

                if (beat === 0) {
                    const label = new Text(x + 30, height - 30, `Bar ${currentBarNum}`, font, config.textTertiaryColor, 'center', 'bottom');
                    renderObjects.push(label);
                } else if (beat % this.getBeatsPerBar() === 0) {
                    const label = new Text(x + 30, height - 30, `Bar ${currentBarNum + barInUnit - 1}`, font, config.textTertiaryColor, 'center', 'bottom');
                    renderObjects.push(label);
                } else {
                    const label = new Text(x, height - 15, `${beatNum}`, font, config.textTertiaryColor, 'center', 'bottom');
                    renderObjects.push(label);
                }
            }
        }

        // Current bar indicator in top right
        if (this.showBarIndicator) {
            const timeUnitInSeconds = this.getTimeUnit();
            const currentBarNum = Math.floor(config.targetTime / timeUnitInSeconds) + 1;
            const totalBars = Math.ceil(duration / timeUnitInSeconds);

            const text = `Bar ${currentBarNum} of ${totalBars}`;
            const fontSize = 16;
            const font = `${this.beatFontWeight} ${fontSize}px ${this.beatFontFamily}, sans-serif`;

            const barIndicator = new Text(width - 10, 25, text, font, config.textColor, 'right', 'top');
            renderObjects.push(barIndicator);
        }

        // Border for time unit area
        if (this.showBeatGrid) {
            const border = new Rectangle(pianoWidth, height - 50, rollWidth, 50, null, 'rgba(255, 255, 255, 0.3)', 1);
            renderObjects.push(border);
        }

        return renderObjects;
    }

    _buildPlayhead(config) {
        const renderObjects = [];
        const { canvas, playheadColor, pianoWidth, rollWidth, targetTime } = config;

        // Calculate playhead position directly
        const timeUnitInSeconds = this.getTimeUnit();
        const windowStart = Math.floor(targetTime / timeUnitInSeconds) * timeUnitInSeconds;
        const playheadPosition = ((targetTime - windowStart) / timeUnitInSeconds) * rollWidth;
        const playheadX = pianoWidth + playheadPosition;

        const playhead = Line.createPlayhead(
            playheadX,
            0,
            canvas.height - 50,
            playheadColor,
            this.playheadLineWidth
        );

        renderObjects.push(playhead);
        return renderObjects;
    }

    _getNoteName(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = noteNames[midiNote % 12];
        return `${noteName}${octave}`;
    }

    // Setters for external configuration
    setTimeUnitBars(bars) {
        this.timeUnitBars = bars;
        this.updateTimeUnit();
        return this;
    }

    setNoteRange(minNote, maxNote) {
        this.minNote = minNote;
        this.maxNote = maxNote;
        return this;
    }

    setAnimationType(type) {
        this.animationType = type;
        if (this.animationController) {
            this.animationController.updateSettings(this);
        }
        return this;
    }

    setAnimationSpeed(speed) {
        this.animationSpeed = speed;
        if (this.animationController) {
            this.animationController.updateSettings(this);
        }
        return this;
    }

    setAnimationDuration(duration) {
        this.animationDuration = duration;
        if (this.animationController) {
            this.animationController.updateSettings(this);
        }
        return this;
    }

    setChannelColors(colors) {
        this.channelColors = colors;
        return this;
    }

    setChannelColor(channelIndex, color) {
        if (channelIndex >= 0 && channelIndex < this.channelColors.length) {
            this.channelColors[channelIndex] = color;
        }
        return this;
    }

    // Getters for external access (delegate to TimingManager)
    getTimeUnitBars() {
        return this.timeUnitBars;
    }

    getBeatsPerBar() {
        return this.timingManager.beatsPerBar;
    }

    getBPM() {
        return this.timingManager.bpm;
    }

    getNoteRange() {
        return { min: this.minNote, max: this.maxNote };
    }

    /**
     * Handle MIDI file configuration changes
     * @private
     */
    _handleMIDIFileConfig(midiFileData) {
        if (!midiFileData) return;

        // If it's a File object, we need to parse it
        if (midiFileData instanceof File) {
            this._loadMIDIFile(midiFileData);
        } else if (typeof midiFileData === 'string') {
            // Could be a base64 encoded MIDI file or URL
            console.log('MIDI file data received as string:', midiFileData.substring(0, 100));
        }
    }

    /**
     * Load and parse a MIDI file for this element
     * @param {File} file - MIDI file to load
     */
    async _loadMIDIFile(file) {
        try {
            console.log(`Loading MIDI file for element ${this.id}:`, file.name);

            // Import MIDIParser dynamically to avoid circular imports
            const { MIDIParser } = await import('../../../core/midi-parser.ts');
            const parser = new MIDIParser();

            // Parse the MIDI file
            const midiData = await parser.parseMIDIFile(file);

            // Create notes array from events (since LocalTimingManager expects notes, not events)
            const notes = [];
            const noteMap = new Map(); // Track note on/off pairs

            // Process events to create note objects
            for (const event of midiData.events) {
                const noteKey = `${event.note}_${event.channel}`;

                if (event.type === 'noteOn') {
                    noteMap.set(noteKey, {
                        note: event.note,
                        channel: event.channel,
                        velocity: event.velocity,
                        startTime: event.timeInSeconds
                    });
                } else if (event.type === 'noteOff') {
                    const noteOn = noteMap.get(noteKey);
                    if (noteOn) {
                        notes.push({
                            ...noteOn,
                            endTime: event.timeInSeconds,
                            duration: event.timeInSeconds - noteOn.startTime
                        });
                        noteMap.delete(noteKey);
                    }
                }
            }

            // Handle any notes that didn't get a noteOff event
            for (const [key, note] of noteMap) {
                notes.push({
                    ...note,
                    endTime: note.startTime + 1.0, // Default 1 second duration
                    duration: 1.0
                });
            }

            // Load the data into our local timing manager
            this.timingManager.loadMIDIData(midiData, notes);

            console.log(`Successfully loaded MIDI file for element ${this.id}:`, {
                duration: this.timingManager.getDuration(),
                noteCount: notes.length,
                bpm: this.timingManager.bpm
            });

            // Trigger a re-render
            this._dispatchChangeEvent();

        } catch (error) {
            console.error(`Failed to load MIDI file for element ${this.id}:`, error);
        }
    }

    /**
     * Get notes from the local timing manager for the current time window
     */
    _getNotesForTimeWindow(config, targetTime) {
        // Use local timing manager's notes instead of config.notes
        const timeUnitDuration = this.getTimeUnit();
        const time = targetTime || config.targetTime; // Use provided targetTime or fallback to config.targetTime
        const windowStart = Math.floor(time / timeUnitDuration) * timeUnitDuration;

        return this.timingManager.getNotesInTimeUnit(time, this.timeUnitBars);
    }

    /**
     * Create NoteBlock objects from the local timing manager's notes
     */
    _createNoteBlocks(config, targetTime) {
        const time = targetTime || config.targetTime; // Use provided targetTime or fallback to config.targetTime
        const notes = this._getNotesForTimeWindow(config, time);

        if (!notes || notes.length === 0) {
            console.log(`No notes available for element ${this.id} at time ${time}`);
            return [];
        }

        // Convert notes to NoteBlock objects
        const noteBlocks = notes.map(note => new NoteBlock(
            note.note,
            note.channel || 0,
            note.startTime,
            note.endTime || note.startTime + (note.duration || 0.5),
            note.velocity || 127
        ));

        console.log(`Created ${noteBlocks.length} note blocks for element ${this.id} at time ${time}`);
        return noteBlocks;
    }

    /**
     * Dispatch a change event to trigger re-renders
     * @private
     */
    _dispatchChangeEvent() {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('elementMIDIChanged', {
                detail: { elementId: this.id }
            }));
        }
    }

    /**
     * Set local BPM for this element
     */
    setBPM(bpm) {
        this.timingManager.setBPM(bpm);
        return this;
    }

    /**
     * Set local beats per bar for this element
     */
    setLocalBeatsPerBar(beatsPerBar) {
        this.timingManager.setBeatsPerBar(beatsPerBar);
        return this;
    }

    /**
     * Load MIDI data directly (for programmatic use)
     */
    loadMIDIData(midiData, notes) {
        this.timingManager.loadMIDIData(midiData, notes);
        this._dispatchChangeEvent();
        return this;
    }
}
