/**
 * LocalTimingManager - Element-specific timing manager for independent timing configurations
 * Each scene element can have its own timing settings, allowing for complex compositions
 */
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

        // Track if macro values are active (to prevent MIDI from overriding them)
        this._hasMacroValues = false;
    }

    /**
     * Load MIDI data specific to this element
     * @param {Object} midiData - Parsed MIDI data
     * @param {Array} notes - Array of note events
     * @param {boolean} resetMacroValues - Whether to reset macro value protection (default: false)
     */
    loadMIDIData(midiData, notes = [], resetMacroValues = false) {
        this.midiData = midiData;
        this.notes = notes;

        // If explicitly requested, reset macro value protection
        // This should only be done when a user intentionally loads a new MIDI file
        if (resetMacroValues) {
            this._hasMacroValues = false;
        }

        // Store original user-configured values to preserve them
        // const userBPM = this.bpm; // kept for potential future rescaling logic

        // Store original MIDI timing for rescaling notes if needed
        // let originalBPM = null;

        // Extract timing information from MIDI data only if user hasn't configured timing
        if (midiData.tempo) {
            this.setTempo(midiData.tempo);
        } else if (midiData.tempo) {
            // Calculate the original BPM from MIDI tempo for note rescaling
            // const originalBPM = 60000000 / midiData.tempo; // Convert microseconds per quarter to BPM
            // rescaleRatio can be calculated on demand if needed
        }

        if (midiData.timeSignature) {
            this.setTimeSignature(midiData.timeSignature);
        }

        if (midiData.ticksPerQuarter) {
            this.setTicksPerQuarter(midiData.ticksPerQuarter);
        }

        this.notes = notes;
        // Calculate duration from notes (use rescaled notes if available)
        const notesToUse = this.notes.length > 0 ? this.notes : notes;
        if (notesToUse.length > 0) {
            this.duration = Math.max(...notesToUse.map(note => note.endTime || note.startTime));
        }

        // Debug logging gated to avoid console overhead in production
        /* console.debug(`LocalTimingManager (${this.elementId}) loaded MIDI data:`, {
                tempo: this.tempo,
                bpm: this.bpm,
                duration: this.duration,
                noteCount: this.notes.length,
                rescaleRatio: rescaleRatio !== 1.0 ? rescaleRatio.toFixed(3) : null,
                hasMacroValues: this._hasMacroValues,
                resetMacroValues: resetMacroValues
        }); */
    }

    /**
     * Set BPM and update tempo
     */
    setBPM(bpm) {
        if (this.bpm === bpm) { return; }
        const oldBPM = this.bpm;
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.tempo = 60000000 / this.bpm; // Convert BPM to microseconds per quarter note

        // Rescale existing notes if BPM changed and we have notes
        if (oldBPM !== this.bpm && this.notes.length > 0) {
            const rescaleRatio = oldBPM / this.bpm; // Inverse ratio for time scaling
            // console.debug(`Rescaling notes due to BPM change: ${oldBPM} -> ${this.bpm} (ratio: ${rescaleRatio.toFixed(3)})`);

            // Optionally log samples in debug mode (removed to reduce overhead)

            this.notes = this.notes.map(note => ({
                ...note,
                startTime: note.startTime * rescaleRatio,
                endTime: (note.endTime || note.startTime) * rescaleRatio,
                duration: (note.duration || 0) * rescaleRatio
            }));

            // Optionally log samples in debug mode (removed to reduce overhead)

            // Recalculate duration
            if (this.notes.length > 0) {
                this.duration = Math.max(...this.notes.map(note => note.endTime || note.startTime));
            }
        }

        this._invalidateCache();
        // console.debug(`LocalTimingManager (${this.elementId}) BPM set to:`, this.bpm);
    }

    /**
     * Set tempo in microseconds per quarter note
     */
    setTempo(tempo) {
        if (this.tempo === tempo) { return; }
        this.tempo = tempo;
        this.bpm = 60000000 / tempo;
        this._invalidateCache();
        // console.debug(`LocalTimingManager (${this.elementId}) tempo set to:`, tempo, 'BPM:', this.bpm);
    }

    /**
     * Set beats per bar
     */
    setBeatsPerBar(beatsPerBar) {
        if (this.beatsPerBar === beatsPerBar) { return; }
        this.beatsPerBar = Math.max(1, Math.min(16, beatsPerBar));
        this._invalidateCache();
        // console.debug(`LocalTimingManager (${this.elementId}) beats per bar set to:`, this.beatsPerBar);
    }

    /**
     * Set time signature
     */
    setTimeSignature(timeSignature) {
        if (this.timeSignature.numerator === timeSignature.numerator &&
            this.timeSignature.denominator === timeSignature.denominator &&
            this.timeSignature.clocksPerClick === timeSignature.clocksPerClick &&
            this.timeSignature.thirtysecondNotesPerBeat === timeSignature.thirtysecondNotesPerBeat) {
            return; // No change
        }
        this.timeSignature = { ...this.timeSignature, ...timeSignature };
        this.beatsPerBar = this.timeSignature.numerator;
        this._invalidateCache();
        // console.debug(`LocalTimingManager (${this.elementId}) time signature set to:`, this.timeSignature);
    }

    /**
     * Set ticks per quarter note
     */
    setTicksPerQuarter(ticksPerQuarter) {
        if (this.ticksPerQuarter === ticksPerQuarter) { return; }
        this.ticksPerQuarter = ticksPerQuarter;
        this._invalidateCache();
        // console.debug(`LocalTimingManager (${this.elementId}) ticks per quarter set to:`, ticksPerQuarter);
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
