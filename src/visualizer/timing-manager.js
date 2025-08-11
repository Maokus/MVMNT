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
            thirtysecondNotesPerBeat: 8,
        };
        this.ticksPerQuarter = 480;
        this.tempo = 500000; // microseconds per quarter note

        // Tempo map support: array of segments sorted by start time (seconds)
        // Each entry: { time: number (seconds), tempo: number (us/qn), bpm: number, secondsPerBeat: number, cumulativeBeats: number }
        this.tempoMap = null;
        this._tempoSegments = null; // normalized segments derived from tempoMap

        // Cache for performance
        this._cache = {};
        this._invalidateCache();
    }

    /**
     * Set BPM and update tempo
     */
    setBPM(bpm) {
        if (this.bpm === bpm) {
            return;
        }
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.tempo = 60000000 / this.bpm; // Convert BPM to microseconds per quarter note
        // When using explicit BPM, clear any tempo map to use single-tempo mode
        this.tempoMap = null;
        this._tempoSegments = null;
        this._invalidateCache();
    }

    /**
     * Set tempo in microseconds per quarter note
     */
    setTempo(tempo) {
        if (this.tempo === tempo) {
            return;
        }
        this.tempo = tempo;
        this.bpm = 60000000 / tempo;
        // Single-tempo mode clears tempo map
        this.tempoMap = null;
        this._tempoSegments = null;
        this._invalidateCache();
    }

    /**
     * Define a tempo map consisting of tempo change events.
     * @param {Array<{time:number, tempo?:number, bpm?:number}>} map - Times are in seconds unless timeUnit==='ticks'.
     * @param {'seconds'|'ticks'} timeUnit - Unit for the provided time values.
     */
    setTempoMap(map, timeUnit = 'seconds') {
        if (!Array.isArray(map) || map.length === 0) {
            this.tempoMap = null;
            this._tempoSegments = null;
            this._invalidateCache();
            return;
        }

        // Normalize into seconds-based segments
        let normalized = map.map((e) => ({ ...e }));
        if (timeUnit === 'ticks') {
            // Convert ticks to seconds using current single-tempo setting as an initial approximation.
            // If callers provide ticks-based tempo map, they should also ensure ticksPerQuarter is set appropriately.
            const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
            normalized = map.map((e) => ({
                time: (e.time * microsecondsPerTick) / 1_000_000,
                tempo: e.tempo ?? (e.bpm ? 60_000_000 / e.bpm : undefined),
                bpm: e.bpm ?? (e.tempo ? 60_000_000 / e.tempo : undefined),
            }));
        } else {
            normalized = map.map((e) => ({
                time: e.time,
                tempo: e.tempo ?? (e.bpm ? 60_000_000 / e.bpm : undefined),
                bpm: e.bpm ?? (e.tempo ? 60_000_000 / e.tempo : undefined),
            }));
        }

        // Filter invalid and sort by time
        normalized = normalized
            .filter((e) => typeof e.time === 'number' && e.time >= 0 && (e.tempo || e.bpm))
            .sort((a, b) => a.time - b.time);

        if (normalized.length === 0) {
            this.tempoMap = null;
            this._tempoSegments = null;
            this._invalidateCache();
            return;
        }

        // Build segments with cumulative beats for fast conversion
        const segments = [];
        let cumulativeBeats = 0;
        for (let i = 0; i < normalized.length; i++) {
            const entry = normalized[i];
            const tempo = entry.tempo ?? 60_000_000 / entry.bpm;
            const secondsPerBeat = tempo / 1_000_000;
            const seg = {
                time: entry.time,
                tempo,
                bpm: 60_000_000 / tempo,
                secondsPerBeat,
                cumulativeBeats, // set start cumulative beats; will be updated for next segment after computing durations
            };
            // Compute cumulativeBeats for next entry based on previous segment duration
            if (segments.length > 0) {
                const prev = segments[segments.length - 1];
                const durationSec = Math.max(0, entry.time - prev.time);
                const beatsInPrev = durationSec / prev.secondsPerBeat;
                cumulativeBeats = prev.cumulativeBeats + beatsInPrev;
                seg.cumulativeBeats = cumulativeBeats; // start beats at this segment
            }
            segments.push(seg);
        }

        // Save and invalidate caches
        this.tempoMap = normalized;
        this._tempoSegments = segments;
        this._invalidateCache();
    }

    /**
     * Set beats per bar
     */
    setBeatsPerBar(beatsPerBar) {
        if (this.beatsPerBar === beatsPerBar) {
            return;
        }
        this.beatsPerBar = Math.max(1, Math.min(16, beatsPerBar));
        this._invalidateCache();
    }

    /**
     * Set time signature
     */
    setTimeSignature(timeSignature) {
        if (
            this.timeSignature.numerator === timeSignature.numerator &&
            this.timeSignature.denominator === timeSignature.denominator &&
            this.timeSignature.clocksPerClick === timeSignature.clocksPerClick &&
            this.timeSignature.thirtysecondNotesPerBeat === timeSignature.thirtysecondNotesPerBeat
        ) {
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
        if (this.ticksPerQuarter === ticksPerQuarter) {
            return;
        }
        this.ticksPerQuarter = ticksPerQuarter;
        this._invalidateCache();
    }

    /**
     * Get seconds per beat
     */
    getSecondsPerBeat(timeInSeconds = undefined) {
        // If tempo map active and time provided, use segment-specific seconds per beat
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            const t = typeof timeInSeconds === 'number' ? timeInSeconds : 0;
            const seg = this._findTempoSegmentAtTime(t);
            return seg.secondsPerBeat;
        }
        if (this._cache.secondsPerBeat === undefined) {
            this._cache.secondsPerBeat = this.tempo / 1000000;
        }
        return this._cache.secondsPerBeat;
    }

    /**
     * Get seconds per bar
     */
    getSecondsPerBar(timeInSeconds = undefined) {
        if (this._tempoSegments && this._tempoSegments.length > 0 && typeof timeInSeconds === 'number') {
            return this.getSecondsPerBeat(timeInSeconds) * this.beatsPerBar;
        }
        if (this._cache.secondsPerBar === undefined) {
            this._cache.secondsPerBar = this.getSecondsPerBeat() * this.beatsPerBar;
        }
        return this._cache.secondsPerBar;
    }

    /**
     * Get time unit duration in seconds
     */
    getTimeUnitDuration(bars = 1, referenceTimeInSeconds = undefined) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            // Compute duration for a given number of bars starting at the bar containing referenceTime
            if (typeof referenceTimeInSeconds !== 'number') {
                referenceTimeInSeconds = 0;
            }
            const window = this.getTimeUnitWindow(referenceTimeInSeconds, bars);
            return Math.max(0, window.end - window.start);
        }
        return this.getSecondsPerBar(referenceTimeInSeconds) * bars;
    }

    /**
     * Convert time to bar:beat:tick
     */
    timeToBarBeatTick(timeInSeconds) {
        let totalBeats;
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            totalBeats = this._secondsToBeats(timeInSeconds);
        } else {
            const secondsPerBeat = this.getSecondsPerBeat();
            totalBeats = timeInSeconds / secondsPerBeat;
        }
        const bar = Math.floor(totalBeats / this.beatsPerBar) + 1;
        const beat = Math.floor(totalBeats % this.beatsPerBar) + 1;
        const tick = Math.floor((totalBeats % 1) * this.ticksPerQuarter);
        return { bar, beat, tick, totalBeats };
    }

    /**
     * Convert bar:beat:tick to time in seconds
     */
    barBeatTickToTime(bar, beat, tick) {
        const totalBeats = (bar - 1) * this.beatsPerBar + (beat - 1) + tick / this.ticksPerQuarter;
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            return this._beatsToSeconds(totalBeats);
        }
        return totalBeats * this.getSecondsPerBeat();
    }

    /**
     * Convert MIDI ticks to seconds
     */
    ticksToSeconds(ticks) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            // Convert ticks to beats then to seconds using current single-tempo tick size is not accurate with tempo map.
            // Prefer providing seconds-based tempo map to this manager.
            const beats = ticks / this.ticksPerQuarter;
            return this._beatsToSeconds(beats);
        }
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (ticks * microsecondsPerTick) / 1000000;
    }

    /**
     * Convert seconds to MIDI ticks
     */
    secondsToTicks(seconds) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            const beats = this._secondsToBeats(seconds);
            return beats * this.ticksPerQuarter;
        }
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (seconds * 1000000) / microsecondsPerTick;
    }

    /** Public: convert beats to seconds using current tempo or tempo map */
    beatsToSeconds(beats) {
        return this._beatsToSeconds(beats);
    }

    /** Public: convert seconds to beats using current tempo or tempo map */
    secondsToBeats(seconds) {
        return this._secondsToBeats(seconds);
    }

    /**
     * Compute the time window [start,end) aligned to bar boundaries that contains the given time.
     * @param {number} referenceTimeInSeconds
     * @param {number} bars
     * @returns {{start:number,end:number}}
     */
    getTimeUnitWindow(referenceTimeInSeconds, bars = 1) {
        const beatsPerWindow = bars * this.beatsPerBar;
        let totalBeatsAtRef;
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            totalBeatsAtRef = this._secondsToBeats(referenceTimeInSeconds);
        } else {
            totalBeatsAtRef = referenceTimeInSeconds / this.getSecondsPerBeat();
        }
        const barIndex = Math.floor(totalBeatsAtRef / this.beatsPerBar);
        const windowStartBarIndex = Math.floor(barIndex / bars) * bars;
        const startBeats = windowStartBarIndex * this.beatsPerBar;
        const endBeats = startBeats + beatsPerWindow;
        const start = this._beatsToSeconds(startBeats);
        const end = this._beatsToSeconds(endBeats);
        return { start, end };
    }

    /**
     * Return beat markers within a window, including whether each is a bar start.
     * @param {number} windowStart
     * @param {number} windowEnd
     * @returns {Array<{time:number,isBarStart:boolean,beatIndex:number,barNumber:number,beatNumber:number}>}
     */
    getBeatGridInWindow(windowStart, windowEnd) {
        const startBeats = this._secondsToBeats(windowStart);
        const endBeats = this._secondsToBeats(windowEnd);
        const beats = [];
        const startIndex = Math.ceil(startBeats - 1e-9); // next whole beat
        const endIndex = Math.floor(endBeats + 1e-9);
        for (let bi = startIndex; bi <= endIndex; bi++) {
            const time = this._beatsToSeconds(bi);
            const isBarStart = bi % this.beatsPerBar === 0;
            const barNumber = Math.floor(bi / this.beatsPerBar) + 1;
            const beatNumber = (bi % this.beatsPerBar) + 1;
            beats.push({ time, isBarStart, beatIndex: bi, barNumber, beatNumber });
        }
        return beats;
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
            tempo: this.tempo,
            tempoMap: this.tempoMap ? [...this.tempoMap] : null,
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
        if (config.tempoMap !== undefined && config.tempoMap) this.setTempoMap(config.tempoMap, 'seconds');
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
            tempoMap: this.tempoMap,
            secondsPerBeat: this.getSecondsPerBeat(),
            secondsPerBar: this.getSecondsPerBar(),
        });
    }

    // ========================
    // Internal helpers
    // ========================
    _findTempoSegmentAtTime(t) {
        const segs = this._tempoSegments;
        if (!segs || segs.length === 0) {
            return {
                time: 0,
                tempo: this.tempo,
                bpm: this.bpm,
                secondsPerBeat: this.tempo / 1_000_000,
                cumulativeBeats: 0,
            };
        }
        // Binary search for last segment with time <= t
        let lo = 0,
            hi = segs.length - 1,
            idx = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (segs[mid].time <= t) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return segs[idx];
    }

    _secondsToBeats(t) {
        const segs = this._tempoSegments;
        if (!segs || segs.length === 0) {
            return t / this.getSecondsPerBeat();
        }
        const seg = this._findTempoSegmentAtTime(t);
        let beats = seg.cumulativeBeats;
        const dt = t - seg.time;
        beats += dt / seg.secondsPerBeat;
        return beats;
    }

    _beatsToSeconds(beats) {
        const segs = this._tempoSegments;
        if (!segs || segs.length === 0) {
            return beats * this.getSecondsPerBeat();
        }
        // Find segment where cumulativeBeats <= beats < next.cumulativeBeats
        let lo = 0,
            hi = segs.length - 1,
            idx = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (segs[mid].cumulativeBeats <= beats) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        const seg = segs[idx];
        const beatsInSeg = beats - seg.cumulativeBeats;
        return seg.time + beatsInSeg * seg.secondsPerBeat;
    }
}
