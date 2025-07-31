/**
 * LocalTimingManager - Element-specific timing manager for independent timing configurations
 * Each scene element can have its own timing settings, allowing for complex compositions
 */
import { globalMacroManager } from './macro-manager';

export class LocalTimingManager {
    constructor(elementId = null) {
        this.elementId = elementId;

        // Default timing values - can be independent per element
        this.bpm = 120;
        this.beatsPerBar = 4;
        this.timeSignature = {
            numerator: 4,
            denominator: 4,
            clocksPerClick: 24,
            thirtysecondNotesPerBeat: 8
        };
        this.ticksPerQuarter = 480;
        this.tempo = 500000; // microseconds per quarter note

        // Cache for performance
        this._cache = {};
        this._invalidateCache();

        // MIDI data specific to this element
        this.midiData = null;
        this.notes = [];
        this.duration = 0;

        // Macro integration
        this._setupMacroIntegration();
    }

    /**
     * Set up macro integration for timing properties
     * @private
     */
    _setupMacroIntegration() {
        // Listen for macro changes that affect this element
        globalMacroManager.addListener((eventType, data) => {
            if (eventType === 'macroValueChanged') {
                this._handleMacroValueChange(data);
            }
        });
    }

    /**
     * Handle macro value changes that affect this element
     * @private
     */
    _handleMacroValueChange(data) {
        if (!this.elementId) return;

        // Check if any of the assignments affect this element
        const relevantAssignments = data.assignments.filter(
            assignment => assignment.elementId === this.elementId
        );

        for (const assignment of relevantAssignments) {
            this._applyMacroValue(assignment.propertyPath, data.value);
        }
    }

    /**
     * Apply a macro value to a property path
     * @private
     */
    _applyMacroValue(propertyPath, value) {
        // Handle specific timing properties that need special processing
        if (propertyPath === 'bpm') {
            this.setBPM(value);
            return;
        }

        if (propertyPath === 'beatsPerBar') {
            this.setBeatsPerBar(value);
            return;
        }

        if (propertyPath === 'tempo') {
            this.setTempo(value);
            return;
        }

        // Handle general property paths
        const parts = propertyPath.split('.');
        let target = this;

        // Navigate to the target property
        for (let i = 0; i < parts.length - 1; i++) {
            if (target[parts[i]] === undefined) {
                console.warn(`Property path '${propertyPath}' not found in LocalTimingManager`);
                return;
            }
            target = target[parts[i]];
        }

        const finalProperty = parts[parts.length - 1];
        if (target[finalProperty] !== undefined) {
            target[finalProperty] = value;
            this._invalidateCache();
            console.log(`Applied macro value to ${this.elementId}.${propertyPath}:`, value);
        }
    }

    /**
     * Load MIDI data specific to this element
     * @param {Object} midiData - Parsed MIDI data
     * @param {Array} notes - Array of note events
     */
    loadMIDIData(midiData, notes = []) {
        this.midiData = midiData;
        this.notes = notes;

        // Store original user-configured values to preserve them
        const userBPM = this.bpm;
        const userBeatsPerBar = this.beatsPerBar;
        const hadUserTimingConfig = this._hasUserTimingConfig();

        // Store original MIDI timing for rescaling notes if needed
        let originalBPM = null;
        let rescaleRatio = 1.0;

        // Extract timing information from MIDI data only if user hasn't configured timing
        if (midiData.tempo && !hadUserTimingConfig) {
            this.setTempo(midiData.tempo);
        } else if (midiData.tempo && hadUserTimingConfig) {
            // Calculate the original BPM from MIDI tempo for note rescaling
            originalBPM = 60000000 / midiData.tempo; // Convert microseconds per quarter to BPM
            rescaleRatio = userBPM / originalBPM;
        }

        if (midiData.timeSignature && !hadUserTimingConfig) {
            this.setTimeSignature(midiData.timeSignature);
        }

        if (midiData.ticksPerQuarter) {
            this.setTicksPerQuarter(midiData.ticksPerQuarter);
        }

        // If user had timing configuration, restore it after MIDI loading and rescale notes
        if (hadUserTimingConfig) {
            this.bpm = userBPM;
            this.beatsPerBar = userBeatsPerBar;
            this._invalidateCache();

            // Rescale note timings to match user's tempo
            if (rescaleRatio !== 1.0 && notes.length > 0) {
                console.log(`Rescaling note timings by factor ${rescaleRatio.toFixed(3)} (${originalBPM?.toFixed(1)} -> ${userBPM} BPM)`);

                // Log a few sample notes before rescaling
                const sampleNotes = notes.slice(0, 3);
                console.log('Sample notes before rescaling:', sampleNotes.map(n => ({
                    note: n.note,
                    start: n.startTime?.toFixed(2),
                    end: n.endTime?.toFixed(2)
                })));

                this.notes = notes.map(note => ({
                    ...note,
                    startTime: note.startTime / rescaleRatio,
                    endTime: (note.endTime || note.startTime) / rescaleRatio,
                    duration: (note.duration || 0) / rescaleRatio
                }));

                // Log the same notes after rescaling
                const rescaledSampleNotes = this.notes.slice(0, 3);
                console.log('Sample notes after rescaling:', rescaledSampleNotes.map(n => ({
                    note: n.note,
                    start: n.startTime?.toFixed(2),
                    end: n.endTime?.toFixed(2)
                })));
            } else {
                this.notes = notes;
            }
        } else {
            this.notes = notes;
        }

        // Calculate duration from notes (use rescaled notes if available)
        const notesToUse = this.notes.length > 0 ? this.notes : notes;
        if (notesToUse.length > 0) {
            this.duration = Math.max(...notesToUse.map(note => note.endTime || note.startTime));
        }

        console.log(`LocalTimingManager (${this.elementId}) loaded MIDI data:`, {
            tempo: this.tempo,
            bpm: this.bpm,
            duration: this.duration,
            noteCount: this.notes.length,
            preservedUserTiming: hadUserTimingConfig,
            rescaleRatio: rescaleRatio !== 1.0 ? rescaleRatio.toFixed(3) : null
        });
    }

    /**
     * Check if user has configured timing settings (via macros or direct config)
     * @private
     */
    _hasUserTimingConfig() {
        if (!this.elementId) return false;

        // Check if this element has macro assignments for timing properties
        const elementMacros = globalMacroManager.getElementMacros(this.elementId);
        const hasTimingMacros = elementMacros.some(macro =>
            macro.propertyPath === 'bpm' ||
            macro.propertyPath === 'beatsPerBar' ||
            macro.propertyPath === 'tempo'
        );

        // Also check if timing values differ from defaults (indicating user configuration)
        const hasNonDefaultValues = this.bpm !== 120 || this.beatsPerBar !== 4;

        return hasTimingMacros || hasNonDefaultValues;
    }

    /**
     * Set BPM and update tempo
     */
    setBPM(bpm) {
        const oldBPM = this.bpm;
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.tempo = 60000000 / this.bpm; // Convert BPM to microseconds per quarter note

        // Rescale existing notes if BPM changed and we have notes
        if (oldBPM !== this.bpm && this.notes.length > 0) {
            const rescaleRatio = oldBPM / this.bpm; // Inverse ratio for time scaling
            console.log(`Rescaling notes due to BPM change: ${oldBPM} -> ${this.bpm} (ratio: ${rescaleRatio.toFixed(3)})`);

            // Log a few sample notes before rescaling
            const sampleNotes = this.notes.slice(0, 3);
            console.log('Sample notes before BPM rescaling:', sampleNotes.map(n => ({
                note: n.note,
                start: n.startTime?.toFixed(2),
                end: n.endTime?.toFixed(2)
            })));

            this.notes = this.notes.map(note => ({
                ...note,
                startTime: note.startTime * rescaleRatio,
                endTime: (note.endTime || note.startTime) * rescaleRatio,
                duration: (note.duration || 0) * rescaleRatio
            }));

            // Log the same notes after rescaling
            const rescaledSampleNotes = this.notes.slice(0, 3);
            console.log('Sample notes after BPM rescaling:', rescaledSampleNotes.map(n => ({
                note: n.note,
                start: n.startTime?.toFixed(2),
                end: n.endTime?.toFixed(2)
            })));

            // Recalculate duration
            if (this.notes.length > 0) {
                this.duration = Math.max(...this.notes.map(note => note.endTime || note.startTime));
            }
        }

        this._invalidateCache();
        console.log(`LocalTimingManager (${this.elementId}) BPM set to:`, this.bpm);
    }

    /**
     * Set tempo in microseconds per quarter note
     */
    setTempo(tempo) {
        this.tempo = tempo;
        this.bpm = 60000000 / tempo;
        this._invalidateCache();
        console.log(`LocalTimingManager (${this.elementId}) tempo set to:`, tempo, 'BPM:', this.bpm);
    }

    /**
     * Set beats per bar
     */
    setBeatsPerBar(beatsPerBar) {
        this.beatsPerBar = Math.max(1, Math.min(16, beatsPerBar));
        this._invalidateCache();
        console.log(`LocalTimingManager (${this.elementId}) beats per bar set to:`, this.beatsPerBar);
    }

    /**
     * Set time signature
     */
    setTimeSignature(timeSignature) {
        this.timeSignature = { ...this.timeSignature, ...timeSignature };
        this.beatsPerBar = this.timeSignature.numerator;
        this._invalidateCache();
        console.log(`LocalTimingManager (${this.elementId}) time signature set to:`, this.timeSignature);
    }

    /**
     * Set ticks per quarter note
     */
    setTicksPerQuarter(ticksPerQuarter) {
        this.ticksPerQuarter = ticksPerQuarter;
        this._invalidateCache();
        console.log(`LocalTimingManager (${this.elementId}) ticks per quarter set to:`, ticksPerQuarter);
    }

    /**
     * Get seconds per beat
     */
    getSecondsPerBeat() {
        if (this._cache.secondsPerBeat === undefined) {
            this._cache.secondsPerBeat = this.tempo / 1000000;
        }
        return this._cache.secondsPerBeat;
    }

    /**
     * Get seconds per bar
     */
    getSecondsPerBar() {
        if (this._cache.secondsPerBar === undefined) {
            this._cache.secondsPerBar = this.getSecondsPerBeat() * this.beatsPerBar;
        }
        return this._cache.secondsPerBar;
    }

    /**
     * Get time unit duration in seconds
     */
    getTimeUnitDuration(bars = 1) {
        return this.getSecondsPerBar() * bars;
    }

    /**
     * Convert time to bar:beat:tick
     */
    timeToBarBeatTick(timeInSeconds) {
        const secondsPerBeat = this.getSecondsPerBeat();
        const totalBeats = timeInSeconds / secondsPerBeat;

        const bar = Math.floor(totalBeats / this.beatsPerBar) + 1;
        const beat = Math.floor(totalBeats % this.beatsPerBar) + 1;
        const tick = Math.floor((totalBeats % 1) * this.ticksPerQuarter);

        return { bar, beat, tick, totalBeats };
    }

    /**
     * Convert bar:beat:tick to time in seconds
     */
    barBeatTickToTime(bar, beat, tick) {
        const totalBeats = (bar - 1) * this.beatsPerBar + (beat - 1) + (tick / this.ticksPerQuarter);
        return totalBeats * this.getSecondsPerBeat();
    }

    /**
     * Convert MIDI ticks to seconds
     */
    ticksToSeconds(ticks) {
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (ticks * microsecondsPerTick) / 1000000;
    }

    /**
     * Convert seconds to MIDI ticks
     */
    secondsToTicks(seconds) {
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (seconds * 1000000) / microsecondsPerTick;
    }

    /**
     * Get notes for a specific time window
     */
    getNotesInTimeWindow(startTime, endTime) {
        if (!this.notes) return [];

        return this.notes.filter(note => {
            const noteStart = note.startTime;
            const noteEnd = note.endTime || noteStart;

            // Note is active if it overlaps with the time window
            return noteStart < endTime && noteEnd > startTime;
        });
    }

    /**
     * Get notes for a specific time unit window
     */
    getNotesInTimeUnit(currentTime, timeUnitBars = 1) {
        const timeUnitDuration = this.getTimeUnitDuration(timeUnitBars);
        const windowStart = Math.floor(currentTime / timeUnitDuration) * timeUnitDuration;
        const windowEnd = windowStart + timeUnitDuration;

        const notesInWindow = this.getNotesInTimeWindow(windowStart, windowEnd);

        console.log(`LocalTimingManager (${this.elementId}) getNotesInTimeUnit:`, {
            currentTime,
            timeUnitBars,
            timeUnitDuration,
            windowStart,
            windowEnd,
            totalNotes: this.notes.length,
            notesInWindow: notesInWindow.length
        });

        return notesInWindow;
    }

    /**
     * Get configuration object for serialization
     */
    getConfig() {
        return {
            bpm: this.bpm,
            beatsPerBar: this.beatsPerBar,
            timeSignature: { ...this.timeSignature },
            ticksPerQuarter: this.ticksPerQuarter,
            tempo: this.tempo
        };
    }

    /**
     * Apply configuration from object
     */
    applyConfig(config) {
        if (config.bpm !== undefined) this.setBPM(config.bpm);
        if (config.beatsPerBar !== undefined) this.setBeatsPerBar(config.beatsPerBar);
        if (config.timeSignature !== undefined) this.setTimeSignature(config.timeSignature);
        if (config.ticksPerQuarter !== undefined) this.setTicksPerQuarter(config.ticksPerQuarter);
        if (config.tempo !== undefined) this.setTempo(config.tempo);
    }

    /**
     * Get element-specific MIDI notes
     */
    getNotes() {
        return this.notes || [];
    }

    /**
     * Get element-specific duration
     */
    getDuration() {
        return this.duration;
    }

    /**
     * Invalidate cache when timing properties change
     * @private
     */
    _invalidateCache() {
        this._cache = {};
    }

    /**
     * Log configuration for debugging
     */
    logConfiguration() {
        console.log(`LocalTimingManager Configuration (${this.elementId}):`, {
            bpm: this.bpm,
            beatsPerBar: this.beatsPerBar,
            timeSignature: this.timeSignature,
            ticksPerQuarter: this.ticksPerQuarter,
            tempo: this.tempo,
            secondsPerBeat: this.getSecondsPerBeat(),
            secondsPerBar: this.getSecondsPerBar(),
            noteCount: this.notes.length,
            duration: this.duration
        });
    }
}
