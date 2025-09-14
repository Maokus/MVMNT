// PlaybackClock - converts real-time deltas to musical ticks as authoritative playhead.
// This abstraction replaces direct seconds-based advancement. It is tempo-aware (supports tempo map changes)
// and accumulates fractional tick remainders to avoid drift.
//
// Temporary dual-domain note: callers may mirror derived seconds via TimingManager
// when needed for UI code. Seconds are strictly derived through selectors.

import { TimingManager } from '@core/timing';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';

export interface PlaybackClockConfig {
    timingManager: TimingManager; // shared timing manager (provides tempo / tempo map / PPQ)
    initialTick?: number; // starting tick position
    rate?: number; // playback rate multiplier (1 = normal)
    autoStartPaused?: boolean; // optional: start in paused state
}

export class PlaybackClock {
    private tm: TimingManager;
    private _lastWallTimeMs: number | null = null;
    private _tick: number;
    private _fractionalTicks: number = 0; // accumulator for sub-tick precision
    private _rate: number;
    private _isPaused: boolean = false;
    private _lastPauseWallTimeMs: number | null = null; // wall time when pause() was invoked

    constructor(cfg: PlaybackClockConfig) {
        this.tm = cfg.timingManager;
        this._tick = cfg.initialTick ?? 0;
        this._rate = cfg.rate ?? 1;
        if (cfg.autoStartPaused) this._isPaused = true;
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

    get isPaused() {
        return this._isPaused;
    }

    /**
     * Pause the clock: subsequent calls to update() will NOT advance time until resume() is called.
     * We still refresh the internal _lastWallTimeMs inside update() so that the elapsed real time
     * while paused is excluded when resuming (no large dt burst).
     */
    pause(nowMs?: number) {
        if (this._isPaused) return;
        this._isPaused = true;
        this._lastPauseWallTimeMs = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    }

    /**
     * Resume playback. We reset the wall-time anchor to the provided nowMs (or performance.now()) so that
     * the real-time gap during the paused interval does not accumulate as a huge dt.
     */
    resume(nowMs?: number) {
        if (!this._isPaused) return;
        const t = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this._isPaused = false;
        // Anchor last wall time to resume moment so next update() sees dt ~ frame duration.
        this._lastWallTimeMs = t;
        this._lastPauseWallTimeMs = null;
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
        // If paused: do NOT advance tick, but keep wall anchor fresh so resuming excludes paused gap.
        if (this._isPaused) {
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
    // Auto-start paused if the global transport is not currently playing. This ensures tests and
    // paused timeline scenarios do not allow internal clock advancement until an explicit resume.
    // (Addresses expectation in playback.pause-freeze tests that clock.update() while paused does not advance.)
    let autoStartPaused = false;
    try {
        const s = useTimelineStore.getState();
        autoStartPaused = !s.transport.isPlaying; // treat any non-playing state as paused for clock start purposes
    } catch {
        /* ignore store access errors */
    }
    return new PlaybackClock({ timingManager: getSharedTimingManager(), initialTick, rate, autoStartPaused });
}
