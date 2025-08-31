/**
 * TimingManager - Element-specific timing manager for independent timing configurations
 * Pure timing responsibilities (no MIDI note management)
 */
import {
    beatsToSecondsWithMap as _beatsToSecondsWithTempoMap,
    secondsToBeatsWithMap as _secondsToBeatsWithTempoMap,
} from './tempo-utils';

export interface TimeSignature {
    numerator: number;
    denominator: number;
    clocksPerClick: number;
    thirtysecondNotesPerBeat: number;
}

export interface TempoMapEntry {
    time: number; // seconds
    tempo?: number; // microseconds per quarter note
    bpm?: number; // bpm convenience
}

interface NormalizedTempoEntry {
    time: number;
    tempo: number; // microseconds per quarter note
    bpm: number;
    secondsPerBeat: number;
    cumulativeBeats: number; // beats up to segment start
}

export interface TimingConfig {
    bpm?: number;
    beatsPerBar?: number;
    timeSignature?: Partial<TimeSignature>;
    ticksPerQuarter?: number;
    tempo?: number;
    tempoMap?: TempoMapEntry[] | null;
}

export class TimingManager {
    public elementId: string | null;
    public bpm: number;
    public beatsPerBar: number;
    public timeSignature: TimeSignature;
    public ticksPerQuarter: number;
    public tempo: number; // microseconds per quarter note
    public tempoMap: TempoMapEntry[] | null;
    private _tempoSegments: NormalizedTempoEntry[] | null;
    private _cache: Record<string, any>;

    constructor(elementId: string | null = null) {
        this.elementId = elementId;

        // Default timing values
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

        this.tempoMap = null;
        this._tempoSegments = null;

        this._cache = {};
        this._invalidateCache();
    }

    setBPM(bpm: number) {
        if (this.bpm === bpm) return;
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.tempo = 60000000 / this.bpm;
        this.tempoMap = null;
        this._tempoSegments = null;
        this._invalidateCache();
    }

    setTempo(tempo: number) {
        if (this.tempo === tempo) return;
        this.tempo = tempo;
        this.bpm = 60000000 / tempo;
        this.tempoMap = null;
        this._tempoSegments = null;
        this._invalidateCache();
    }

    /**
     * Define a tempo map consisting of tempo change events.
     * @param map Times are in seconds unless timeUnit==='ticks'.
     * @param timeUnit Unit for the provided time values.
     */
    setTempoMap(map: TempoMapEntry[] | null | undefined, timeUnit: 'seconds' | 'ticks' = 'seconds') {
        if (!Array.isArray(map) || map.length === 0) {
            this.tempoMap = null;
            this._tempoSegments = null;
            this._invalidateCache();
            return;
        }

        let normalized: TempoMapEntry[] = map.map((e) => ({ ...e }));
        if (timeUnit === 'ticks') {
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

        normalized = normalized
            .filter((e) => typeof e.time === 'number' && e.time >= 0 && (e.tempo != null || e.bpm != null))
            .sort((a, b) => a.time - b.time);

        if (normalized.length === 0) {
            this.tempoMap = null;
            this._tempoSegments = null;
            this._invalidateCache();
            return;
        }

        const segments: NormalizedTempoEntry[] = [];
        let cumulativeBeats = 0;
        for (let i = 0; i < normalized.length; i++) {
            const entry = normalized[i];
            const tempo = entry.tempo ?? 60_000_000 / (entry.bpm as number);
            const secondsPerBeat = tempo / 1_000_000;
            const seg: NormalizedTempoEntry = {
                time: entry.time,
                tempo,
                bpm: 60_000_000 / tempo,
                secondsPerBeat,
                cumulativeBeats,
            };
            if (segments.length > 0) {
                const prev = segments[segments.length - 1];
                const durationSec = Math.max(0, entry.time - prev.time);
                const beatsInPrev = durationSec / prev.secondsPerBeat;
                cumulativeBeats = prev.cumulativeBeats + beatsInPrev;
                seg.cumulativeBeats = cumulativeBeats;
            }
            segments.push(seg);
        }

        this.tempoMap = normalized;
        this._tempoSegments = segments;
        this._invalidateCache();
    }

    setBeatsPerBar(beatsPerBar: number) {
        if (this.beatsPerBar === beatsPerBar) return;
        this.beatsPerBar = Math.max(1, Math.min(16, beatsPerBar));
        this._invalidateCache();
    }

    setTimeSignature(timeSignature: Partial<TimeSignature>) {
        const ts = { ...this.timeSignature, ...timeSignature };
        if (
            this.timeSignature.numerator === ts.numerator &&
            this.timeSignature.denominator === ts.denominator &&
            this.timeSignature.clocksPerClick === ts.clocksPerClick &&
            this.timeSignature.thirtysecondNotesPerBeat === ts.thirtysecondNotesPerBeat
        ) {
            return;
        }
        this.timeSignature = ts;
        this.beatsPerBar = ts.numerator;
        this._invalidateCache();
    }

    setTicksPerQuarter(ticksPerQuarter: number) {
        if (this.ticksPerQuarter === ticksPerQuarter) return;
        this.ticksPerQuarter = ticksPerQuarter;
        this._invalidateCache();
    }

    getSecondsPerBeat(timeInSeconds?: number) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            const t = typeof timeInSeconds === 'number' ? timeInSeconds : 0;
            const seg = this._findTempoSegmentAtTime(t);
            return seg.secondsPerBeat;
        }
        if (this._cache.secondsPerBeat === undefined) {
            this._cache.secondsPerBeat = this.tempo / 1_000_000;
        }
        return this._cache.secondsPerBeat as number;
    }

    getSecondsPerBar(timeInSeconds?: number) {
        if (this._tempoSegments && this._tempoSegments.length > 0 && typeof timeInSeconds === 'number') {
            return this.getSecondsPerBeat(timeInSeconds) * this.beatsPerBar;
        }
        if (this._cache.secondsPerBar === undefined) {
            this._cache.secondsPerBar = this.getSecondsPerBeat() * this.beatsPerBar;
        }
        return this._cache.secondsPerBar as number;
    }

    getTimeUnitDuration(bars = 1, referenceTimeInSeconds?: number) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            if (typeof referenceTimeInSeconds !== 'number') referenceTimeInSeconds = 0;
            const window = this.getTimeUnitWindow(referenceTimeInSeconds, bars);
            return Math.max(0, window.end - window.start);
        }
        return this.getSecondsPerBar(referenceTimeInSeconds) * bars;
    }

    timeToBarBeatTick(timeInSeconds: number) {
        let totalBeats: number;
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

    barBeatTickToTime(bar: number, beat: number, tick: number) {
        const totalBeats = (bar - 1) * this.beatsPerBar + (beat - 1) + tick / this.ticksPerQuarter;
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            return this._beatsToSeconds(totalBeats);
        }
        return totalBeats * this.getSecondsPerBeat();
    }

    ticksToSeconds(ticks: number) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            const beats = ticks / this.ticksPerQuarter;
            return this._beatsToSeconds(beats);
        }
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (ticks * microsecondsPerTick) / 1_000_000;
    }

    secondsToTicks(seconds: number) {
        if (this._tempoSegments && this._tempoSegments.length > 0) {
            const beats = this._secondsToBeats(seconds);
            return beats * this.ticksPerQuarter;
        }
        const microsecondsPerTick = this.tempo / this.ticksPerQuarter;
        return (seconds * 1_000_000) / microsecondsPerTick;
    }

    beatsToSeconds(beats: number) {
        return this._beatsToSeconds(beats);
    }
    secondsToBeats(seconds: number) {
        return this._secondsToBeats(seconds);
    }

    /**
     * Convert beats to seconds using a provided tempo map when available.
     * Falls back to this TimingManager's tempoMap and finally fixed tempo.
     */
    beatsToSecondsWithMap(beats: number, tempoMap?: TempoMapEntry[] | null) {
        const fallbackSPB = this.getSecondsPerBeat();
        return _beatsToSecondsWithTempoMap(beats, tempoMap ?? this.tempoMap, fallbackSPB);
    }

    /**
     * Convert seconds to beats using a provided tempo map when available.
     * Falls back to this TimingManager's tempoMap and finally fixed tempo.
     */
    secondsToBeatsWithMap(seconds: number, tempoMap?: TempoMapEntry[] | null) {
        const fallbackSPB = this.getSecondsPerBeat();
        return _secondsToBeatsWithTempoMap(seconds, tempoMap ?? this.tempoMap, fallbackSPB);
    }

    getTimeUnitWindow(referenceTimeInSeconds: number, bars = 1) {
        const beatsPerWindow = bars * this.beatsPerBar;
        let totalBeatsAtRef: number;
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
     * Convenience alias for bar-aligned window calculation.
     * Returns the [start, end] in seconds of the bar-aligned window around centerSec.
     */
    getBarAlignedWindow(centerSec: number, bars = 1) {
        return this.getTimeUnitWindow(centerSec, bars);
    }

    getBeatGridInWindow(windowStart: number, windowEnd: number) {
        const startBeats = this._secondsToBeats(windowStart);
        const endBeats = this._secondsToBeats(windowEnd);
        const beats: Array<{
            time: number;
            isBarStart: boolean;
            beatIndex: number;
            barNumber: number;
            beatNumber: number;
        }> = [];
        const startIndex = Math.ceil(startBeats - 1e-9);
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

    getConfig(): TimingConfig {
        return {
            bpm: this.bpm,
            beatsPerBar: this.beatsPerBar,
            timeSignature: { ...this.timeSignature },
            ticksPerQuarter: this.ticksPerQuarter,
            tempo: this.tempo,
            tempoMap: this.tempoMap ? [...this.tempoMap] : null,
        };
    }

    applyConfig(config: TimingConfig) {
        if (config.bpm !== undefined) this.setBPM(config.bpm);
        if (config.beatsPerBar !== undefined) this.setBeatsPerBar(config.beatsPerBar);
        if (config.timeSignature !== undefined) this.setTimeSignature(config.timeSignature);
        if (config.ticksPerQuarter !== undefined) this.setTicksPerQuarter(config.ticksPerQuarter);
        if (config.tempo !== undefined) this.setTempo(config.tempo);
        if (config.tempoMap !== undefined && config.tempoMap) this.setTempoMap(config.tempoMap, 'seconds');
    }

    private _invalidateCache() {
        this._cache = {};
    }

    logConfiguration() {
        // eslint-disable-next-line no-console
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

    private _findTempoSegmentAtTime(t: number): NormalizedTempoEntry {
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

    private _secondsToBeats(t: number) {
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

    private _beatsToSeconds(beats: number) {
        const segs = this._tempoSegments;
        if (!segs || segs.length === 0) {
            return beats * this.getSecondsPerBeat();
        }
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
