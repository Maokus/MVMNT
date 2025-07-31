/**
 * TimingManager - Central authority for all timing-related calculations
 * Handles BPM, ticks per beat, resolution, time signatures and provides
 * conversion methods that ensure consistency across the application.
 */
import { MIDIData, MIDITimeSignature } from './types';

interface TimingCache {
  secondsPerBeat?: number;
  secondsPerBar?: number;
  secondsPerTick?: number;
}

interface BarBeatTick {
  bar: number;
  beat: number;
  tick: number;
}

interface TimingConfiguration {
  bpm: number;
  beatsPerBar: number;
  timeSignature: MIDITimeSignature;
  ticksPerQuarter: number;
  tempo: number;
  secondsPerBeat: number;
  secondsPerBar: number;
  secondsPerTick: number;
}

export class TimingManager {
  public bpm: number = 120;
  public beatsPerBar: number = 4;
  public timeSignature: MIDITimeSignature;
  public ticksPerQuarter: number = 480;
  public tempo: number = 500000; // microseconds per quarter note (120 BPM default)

  // Cache frequently calculated values
  private _cache: TimingCache = {};

  constructor() {
    this.timeSignature = {
      numerator: 4,
      denominator: 4,
      clocksPerClick: 24,
      thirtysecondNotesPerBeat: 8
    };

    this._invalidateCache();
  }

  /**
   * Load timing data from parsed MIDI data
   */
  loadFromMIDIData(midiData: MIDIData): void {
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
   */
  setBPM(bpm: number): void {
    if (bpm <= 0) throw new Error('BPM must be positive');
    if (this.bpm !== bpm) {
      this.bpm = bpm;
      this.tempo = 60000000 / bpm; // Convert to microseconds per quarter note
      this._invalidateCache();
    }
  }

  /**
   * Set tempo in microseconds per quarter note
   */
  setTempo(tempo: number): void {
    if (tempo <= 0) throw new Error('Tempo must be positive');
    if (this.tempo !== tempo) {
      this.tempo = tempo;
      this.bpm = 60000000 / tempo;
      this._invalidateCache();
    }
  }

  /**
   * Set beats per bar
   */
  setBeatsPerBar(beatsPerBar: number): void {
    if (beatsPerBar <= 0) throw new Error('Beats per bar must be positive');
    if (this.beatsPerBar !== beatsPerBar) {
      this.beatsPerBar = beatsPerBar;
      this._invalidateCache();
    }
  }

  /**
   * Set time signature
   */
  setTimeSignature(timeSignature: MIDITimeSignature): void {
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
   */
  setTicksPerQuarter(ticksPerQuarter: number): void {
    if (ticksPerQuarter <= 0) throw new Error('Ticks per quarter must be positive');
    if (this.ticksPerQuarter !== ticksPerQuarter) {
      this.ticksPerQuarter = ticksPerQuarter;
      this._invalidateCache();
    }
  }

  /**
   * Get seconds per beat
   */
  getSecondsPerBeat(): number {
    if (!this._cache.secondsPerBeat) {
      this._cache.secondsPerBeat = 60 / this.bpm;
    }
    return this._cache.secondsPerBeat;
  }

  /**
   * Get seconds per bar
   */
  getSecondsPerBar(): number {
    if (!this._cache.secondsPerBar) {
      this._cache.secondsPerBar = this.getSecondsPerBeat() * this.beatsPerBar;
    }
    return this._cache.secondsPerBar;
  }

  /**
   * Get seconds per tick
   */
  getSecondsPerTick(): number {
    if (!this._cache.secondsPerTick) {
      this._cache.secondsPerTick = (this.tempo / 1000000) / this.ticksPerQuarter;
    }
    return this._cache.secondsPerTick;
  }

  /**
   * Get time unit duration in seconds
   */
  getTimeUnitDuration(timeUnitBars: number = 1): number {
    return this.getSecondsPerBar() * timeUnitBars;
  }

  /**
   * Convert MIDI ticks to seconds
   */
  ticksToSeconds(ticks: number): number {
    return ticks * this.getSecondsPerTick();
  }

  /**
   * Convert seconds to MIDI ticks
   */
  secondsToTicks(seconds: number): number {
    return Math.round(seconds / this.getSecondsPerTick());
  }

  /**
   * Convert time to bar/beat/tick representation
   */
  timeToBarBeatTick(timeInSeconds: number): BarBeatTick {
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
   */
  barBeatTickToTime(bar: number, beat: number, tick: number = 0): number {
    const secondsPerBar = this.getSecondsPerBar();
    const secondsPerBeat = this.getSecondsPerBeat();
    const ticksPerBeat = 960;

    return (bar - 1) * secondsPerBar +
      (beat - 1) * secondsPerBeat +
      (tick / ticksPerBeat) * secondsPerBeat;
  }

  /**
   * Calculate tempo ratio between two BPM values
   */
  calculateTempoRatio(oldBpm: number, newBpm: number): number {
    return oldBpm / newBpm;
  }

  /**
   * Scale time values by tempo ratio
   */
  scaleTimeByTempo(timeInSeconds: number, tempoRatio: number): number {
    return timeInSeconds * tempoRatio;
  }

  /**
   * Get current timing configuration
   */
  getConfiguration(): TimingConfiguration {
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
   */
  clone(): TimingManager {
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
  private _invalidateCache(): void {
    this._cache = {};
  }

  /**
   * Log current timing configuration for debugging
   */
  logConfiguration(): void {
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
