// Phase 3: PlaybackClock - converts real-time deltas to musical ticks as authoritative playhead.
// This abstraction replaces direct seconds-based advancement. It is tempo-aware (supports tempo map changes)
// and accumulates fractional tick remainders to avoid drift.
//
// Temporary dual-domain note: Until Phase 4 purge, callers should still mirror derived seconds via TimingManager
// when needed for legacy UI code. After the purge, seconds will be strictly derived through selectors.

import { TimingManager } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';

export interface PlaybackClockConfig {
    timingManager: TimingManager; // shared timing manager (provides tempo / tempo map / PPQ)
    initialTick?: number; // starting tick position
    rate?: number; // playback rate multiplier (1 = normal)
}

export class PlaybackClock {
    private tm: TimingManager;
    private _lastWallTimeMs: number | null = null;
    private _tick: number;
    private _fractionalTicks: number = 0; // accumulator for sub-tick precision
    private _rate: number;

    constructor(cfg: PlaybackClockConfig) {
        this.tm = cfg.timingManager;
        this._tick = cfg.initialTick ?? 0;
        this._rate = cfg.rate ?? 1;
    }

    get currentTick(): number {
        return this._tick;
    }
    get rate(): number {
        return this._rate;
    }
    set rate(r: number) {
        this._rate = isFinite(r) && r > 0 ? r : 1;
    }

    /**
     * Advance the clock based on the provided high-resolution wall time (performance.now()).
     * Returns the updated integer tick. Caller should then propagate this into store via setCurrentTick.
     * - Handles tempo map changes by querying TimingManager every update for instantaneous secondsPerBeat.
     */
    update(nowMs: number): number {
        if (this._lastWallTimeMs == null) {
            this._lastWallTimeMs = nowMs;
            return this._tick;
        }
        const dtMs = nowMs - this._lastWallTimeMs;
        if (dtMs <= 0) return this._tick;
        this._lastWallTimeMs = nowMs;

        // Convert real-time delta -> beats -> ticks.
        // For tempo map support we approximate using current secondsPerBeat at current musical position.
        // (A more exact integration over segments can be implemented later if needed.)
        const approxSecondsPerBeat = this.tm.getSecondsPerBeat(this.tm.ticksToSeconds(this._tick));
        const seconds = (dtMs / 1000) * this._rate;
        const beatsDelta = seconds / approxSecondsPerBeat;
        const ticksDeltaFloat = beatsDelta * this.tm.ticksPerQuarter;

        const total = this._fractionalTicks + ticksDeltaFloat;
        const whole = Math.trunc(total);
        this._fractionalTicks = total - whole;
        if (whole !== 0) this._tick += whole;
        if (this._tick < 0) {
            this._tick = 0;
            this._fractionalTicks = 0;
        }
        return this._tick;
    }

    /** Force set current tick (e.g., seek / loop wrap) */
    setTick(tick: number) {
        this._tick = Math.max(0, Math.floor(tick));
        this._fractionalTicks = 0;
        // Do not reset lastWallTimeMs so playback continues smoothly; next update will use small dt.
    }

    reset(nowMs?: number) {
        this._lastWallTimeMs = nowMs ?? null;
        this._fractionalTicks = 0;
    }
}

// Convenience factory ensuring all callers share the global TimingManager instance.
export function createSharedPlaybackClock(initialTick: number = 0, rate: number = 1) {
    return new PlaybackClock({ timingManager: getSharedTimingManager(), initialTick, rate });
}
