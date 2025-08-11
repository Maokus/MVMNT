/**
 * TimingManager - Element-specific timing manager for independent timing configurations
 * Pure timing responsibilities (no MIDI note management)
 */
export class TimingManager {
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
    }

    /**
     * Set BPM and update tempo
     */
    setBPM(bpm) {
        if (this.bpm === bpm) { return; }
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.tempo = 60000000 / this.bpm; // Convert BPM to microseconds per quarter note
        this._invalidateCache();
    }

    /**
     * Set tempo in microseconds per quarter note
     */
    setTempo(tempo) {
        if (this.tempo === tempo) { return; }
        this.tempo = tempo;
        this.bpm = 60000000 / tempo;
        this._invalidateCache();
    }

    /**
     * Set beats per bar
     */
    setBeatsPerBar(beatsPerBar) {
        if (this.beatsPerBar === beatsPerBar) { return; }
        this.beatsPerBar = Math.max(1, Math.min(16, beatsPerBar));
        this._invalidateCache();
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
    }

    /**
     * Set ticks per quarter note
     */
    setTicksPerQuarter(ticksPerQuarter) {
        if (this.ticksPerQuarter === ticksPerQuarter) { return; }
        this.ticksPerQuarter = ticksPerQuarter;
        this._invalidateCache();
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
        console.log(`TimingManager Configuration (${this.elementId}):`, {
            bpm: this.bpm,
            beatsPerBar: this.beatsPerBar,
            timeSignature: this.timeSignature,
            ticksPerQuarter: this.ticksPerQuarter,
            tempo: this.tempo,
            secondsPerBeat: this.getSecondsPerBeat(),
            secondsPerBar: this.getSecondsPerBar()
        });
    }
}
