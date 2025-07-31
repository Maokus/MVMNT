/**
 * TimingManager - Central authority for all timing-related calculations
 * Handles BPM, ticks per beat, resolution, time signatures and provides
 * conversion methods that ensure consistency across the application.
 */
export class TimingManager {
    constructor() {
        // Default values
        this.bpm = 120;
        this.beatsPerBar = 4;
        this.timeSignature = {
            numerator: 4,
            denominator: 4,
            clocksPerClick: 24,
            thirtysecondNotesPerBeat: 8
        };
        this.ticksPerQuarter = 480;
        this.tempo = 500000; // microseconds per quarter note (120 BPM default)

        // Cache frequently calculated values
        this._cache = {};
        this._invalidateCache();
    }


    /**
     * Load timing data from parsed MIDI data
     * @param {Object} midiData - The MIDI data from MIDIParser
     */
    loadFromMIDIData(midiData) {
        console.log('TimingManager.loadFromMIDIData called with:', midiData);

        if (midiData.tempo) {
            console.log('Setting tempo from MIDI data:', midiData.tempo);
            this.setTempo(midiData.tempo);
        } else {
            console.warn('No tempo found in MIDI data');
        }

        if (midiData.timeSignature) {
            console.log('Setting time signature from MIDI data:', midiData.timeSignature);
            this.setTimeSignature(midiData.timeSignature);
        } else {
            console.warn('No time signature found in MIDI data');
        }

        if (midiData.ticksPerQuarter) {
            console.log('Setting ticksPerQuarter from MIDI data:', midiData.ticksPerQuarter);
            this.setTicksPerQuarter(midiData.ticksPerQuarter);
        } else {
            console.warn('No ticksPerQuarter found in MIDI data');
        }

        console.log('TimingManager after loading MIDI data:', {
            bpm: this.bpm,
            tempo: this.tempo,
            timeSignature: this.timeSignature,
            ticksPerQuarter: this.ticksPerQuarter
        });
    }

    /**
     * Set BPM and update all dependent calculations
     * @param {number} bpm - Beats per minute
     */
    setBPM(bpm) {
        if (bpm <= 0) throw new Error('BPM must be positive');
        if (this.bpm !== bpm) {
            this.bpm = bpm;
            this.tempo = 60000000 / bpm; // Convert to microseconds per quarter note
            this._invalidateCache();
        }
    }

    /**
     * Set tempo in microseconds per quarter note
     * @param {number} tempo - Microseconds per quarter note
     */
    setTempo(tempo) {
        if (tempo <= 0) throw new Error('Tempo must be positive');
        if (this.tempo !== tempo) {
            this.tempo = tempo;
            this.bpm = 60000000 / tempo;
            this._invalidateCache();
        }
    }

    /**
     * Set beats per bar
     * @param {number} beatsPerBar - Number of beats in a bar
     */
    setBeatsPerBar(beatsPerBar) {
        if (beatsPerBar <= 0) throw new Error('Beats per bar must be positive');
        if (this.beatsPerBar !== beatsPerBar) {
            this.beatsPerBar = beatsPerBar;
            this._invalidateCache();
        }
    }

    /**
     * Set time signature
     * @param {Object} timeSignature - Time signature object
     */
    setTimeSignature(timeSignature) {
        if (!timeSignature) return;

        console.log('TimingManager.setTimeSignature called with:', timeSignature);

        if (JSON.stringify(this.timeSignature) !== JSON.stringify(timeSignature)) {
            this.timeSignature = { ...timeSignature };

            // Update beats per bar based on time signature
            if (timeSignature.numerator && timeSignature.denominator) {
                // In most music, time signature numerator is beats per bar
                this.beatsPerBar = timeSignature.numerator;
                console.log('Updated beatsPerBar to:', this.beatsPerBar);
            }

            this._invalidateCache();
        }
    }

    /**
     * Set ticks per quarter note
     * @param {number} ticksPerQuarter - MIDI ticks per quarter note
     */
    setTicksPerQuarter(ticksPerQuarter) {
        if (ticksPerQuarter <= 0) throw new Error('Ticks per quarter must be positive');
        if (this.ticksPerQuarter !== ticksPerQuarter) {
            this.ticksPerQuarter = ticksPerQuarter;
            this._invalidateCache();
        }
    }

    /**
     * Get seconds per beat
     * @returns {number} Seconds per beat
     */
    getSecondsPerBeat() {
        if (!this._cache.secondsPerBeat) {
            this._cache.secondsPerBeat = 60 / this.bpm;
        }
        return this._cache.secondsPerBeat;
    }

    /**
     * Get seconds per bar
     * @returns {number} Seconds per bar
     */
    getSecondsPerBar() {
        if (!this._cache.secondsPerBar) {
            this._cache.secondsPerBar = this.getSecondsPerBeat() * this.beatsPerBar;
        }
        return this._cache.secondsPerBar;
    }

    /**
     * Get seconds per tick
     * @returns {number} Seconds per MIDI tick
     */
    getSecondsPerTick() {
        if (!this._cache.secondsPerTick) {
            this._cache.secondsPerTick = (this.tempo / 1000000) / this.ticksPerQuarter;
        }
        return this._cache.secondsPerTick;
    }

    /**
     * Get time unit duration in seconds
     * @param {number} timeUnitBars - Number of bars in a time unit
     * @returns {number} Time unit duration in seconds
     */
    getTimeUnitDuration(timeUnitBars = 1) {
        return this.getSecondsPerBar() * timeUnitBars;
    }

    /**
     * Convert MIDI ticks to seconds
     * @param {number} ticks - MIDI ticks
     * @returns {number} Time in seconds
     */
    ticksToSeconds(ticks) {
        return ticks * this.getSecondsPerTick();
    }

    /**
     * Convert seconds to MIDI ticks
     * @param {number} seconds - Time in seconds
     * @returns {number} MIDI ticks
     */
    secondsToTicks(seconds) {
        return Math.round(seconds / this.getSecondsPerTick());
    }

    /**
     * Convert time to bar/beat/tick representation
     * @param {number} timeInSeconds - Time in seconds
     * @returns {Object} Bar/beat/tick object
     */
    timeToBarBeatTick(timeInSeconds) {
        const secondsPerBar = this.getSecondsPerBar();
        const secondsPerBeat = this.getSecondsPerBeat();

        const bar = Math.floor(timeInSeconds / secondsPerBar) + 1;
        const timeInCurrentBar = timeInSeconds % secondsPerBar;
        const beat = Math.floor(timeInCurrentBar / secondsPerBeat) + 1;

        const ticksPerBeat = 960; // Standard MIDI resolution for display
        const timeInCurrentBeat = timeInCurrentBar % secondsPerBeat;
        const tick = Math.floor((timeInCurrentBeat / secondsPerBeat) * ticksPerBeat);

        return {
            bar: Math.max(1, bar),
            beat: Math.max(1, beat),
            tick: Math.max(0, tick)
        };
    }

    /**
     * Convert bar/beat/tick to seconds
     * @param {number} bar - Bar number (1-based)
     * @param {number} beat - Beat number (1-based)
     * @param {number} tick - Tick number (0-based)
     * @returns {number} Time in seconds
     */
    barBeatTickToTime(bar, beat, tick = 0) {
        const secondsPerBar = this.getSecondsPerBar();
        const secondsPerBeat = this.getSecondsPerBeat();
        const ticksPerBeat = 960;

        return (bar - 1) * secondsPerBar +
            (beat - 1) * secondsPerBeat +
            (tick / ticksPerBeat) * secondsPerBeat;
    }

    /**
     * Calculate tempo ratio between two BPM values
     * @param {number} oldBpm - Original BPM
     * @param {number} newBpm - New BPM
     * @returns {number} Tempo ratio (oldBpm / newBpm)
     */
    calculateTempoRatio(oldBpm, newBpm) {
        return oldBpm / newBpm;
    }

    /**
     * Scale time values by tempo ratio
     * @param {number} timeInSeconds - Original time in seconds
     * @param {number} tempoRatio - Tempo ratio
     * @returns {number} Scaled time in seconds
     */
    scaleTimeByTempo(timeInSeconds, tempoRatio) {
        return timeInSeconds * tempoRatio;
    }

    /**
     * Get current timing configuration
     * @returns {Object} Current timing configuration
     */
    getConfiguration() {
        return {
            bpm: this.bpm,
            beatsPerBar: this.beatsPerBar,
            timeSignature: { ...this.timeSignature },
            ticksPerQuarter: this.ticksPerQuarter,
            tempo: this.tempo,
            secondsPerBeat: this.getSecondsPerBeat(),
            secondsPerBar: this.getSecondsPerBar(),
            secondsPerTick: this.getSecondsPerTick()
        };
    }



    /**
     * Create a copy of this timing manager
     * @returns {TimingManager} New timing manager instance
     */
    clone() {
        const clone = new TimingManager();
        clone.bpm = this.bpm;
        clone.tempo = this.tempo;
        clone.timeSignature = { ...this.timeSignature };
        clone.ticksPerQuarter = this.ticksPerQuarter;
        clone.beatsPerBar = this.beatsPerBar; // Make sure beatsPerBar is copied too
        clone._invalidateCache();
        console.log('TimingManager.clone created with beatsPerBar:', clone.beatsPerBar);
        return clone;
    }

    /**
     * Invalidate cached calculations
     * @private
     */
    _invalidateCache() {
        this._cache = {};
    }

    /**
     * Log current timing configuration for debugging
     */
    logConfiguration() {
        const config = this.getConfiguration();
        console.log('TimingManager Configuration:', {
            BPM: config.bpm,
            'Beats Per Bar': config.beatsPerBar,
            'Time Signature': `${config.timeSignature.numerator}/${config.timeSignature.denominator}`,
            'Ticks Per Quarter': config.ticksPerQuarter,
            'Seconds Per Beat': config.secondsPerBeat.toFixed(3),
            'Seconds Per Bar': config.secondsPerBar.toFixed(3),
            'Seconds Per Tick': config.secondsPerTick.toFixed(6)
        });
    }
}

// Export a singleton instance for global use
export const globalTimingManager = new TimingManager();
