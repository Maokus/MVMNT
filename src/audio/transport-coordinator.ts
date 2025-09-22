// TransportCoordinator - Phase 0 foundation.
// Provides dual-mode (future audio vs clock) tick derivation. For Phase 0 we only
// have clock fallback; audio path is scaffolded so later AudioEngine integration
// can flip the source without changing consumers.
//
// Responsibilities:
// - Mirror timeline store play/pause/seek state
// - Derive currentTick each animation frame via either:
//   * AudioContext time (authoritative) -> 'audio' source (future)
//   * Internal PlaybackClock advancing by performance.now deltas -> 'clock'
// - Expose subscription for dev overlay / tests
// - Remain side-effect free: caller updates global store with returned tick.

import { PlaybackClock } from '@core/timing/playback-clock';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import type { TimingManager } from '@core/timing';
import { getAudioEngine, AudioEngine } from '@audio/audio-engine';

export interface TransportStateInternal {
    mode: 'idle' | 'playing' | 'paused';
    startTick: number; // tick position when play() invoked
    playbackStartAudioTime?: number; // audioCtx.currentTime at play()
    lastDerivedTick: number; // last published / derived tick
    source: 'audio' | 'clock'; // which domain is currently authoritative
}

interface AudioLike {
    currentTime: number;
}

export interface TransportCoordinatorConfig {
    getAudioContext?: () => AudioLike | undefined | null; // lazily provide (or fail) -> fallback to clock
    audioEngine?: AudioEngine; // allow injection for tests
}

type Listener = (s: TransportStateInternal) => void;

export class TransportCoordinator {
    private tm: TimingManager;
    private clock: PlaybackClock;
    private cfg: TransportCoordinatorConfig;
    private state: TransportStateInternal;
    private listeners = new Set<Listener>();
    private unsubStore?: () => void;

    constructor(cfg: TransportCoordinatorConfig = {}) {
        this.cfg = cfg;
        this.tm = getSharedTimingManager();
        const startTick = useTimelineStore.getState().timeline.currentTick || 0;
        this.clock = new PlaybackClock({
            timingManager: this.tm,
            initialTick: startTick,
            autoStartPaused: !useTimelineStore.getState().transport.isPlaying,
        });
        this.state = {
            mode: useTimelineStore.getState().transport.isPlaying ? 'playing' : 'idle',
            startTick,
            lastDerivedTick: startTick,
            source: 'clock',
        };
        this.subscribeToStore();
    }

    getState(): TransportStateInternal {
        return this.state;
    }

    subscribe(fn: Listener) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit() {
        this.listeners.forEach((l) => l(this.state));
    }

    private subscribeToStore() {
        this.unsubStore = useTimelineStore.subscribe((s, prev) => {
            if (s.transport.isPlaying !== prev.transport.isPlaying) {
                if (s.transport.isPlaying) this.play();
                else this.pause();
            }
            if (!s.transport.isPlaying && s.timeline.currentTick !== prev.timeline.currentTick) {
                this.seek(s.timeline.currentTick);
            }
        });
    }

    dispose() {
        this.unsubStore?.();
        this.listeners.clear();
    }

    play(fromTick?: number) {
        const tick = typeof fromTick === 'number' ? fromTick : this.state.lastDerivedTick;
        this.state.startTick = tick;
        this.state.lastDerivedTick = tick;
        // Attempt to initialize / create audio engine & context
        // Previous implementation only switched to audio mode if a context already existed,
        // causing silent playback on the first play gesture. We now force-create the context
        // via ensureContext() (synchronously sets internal ctx) and then schedule sources.
        let ctx: AudioLike | undefined | null = undefined;
        try {
            // Caller may provide a custom context accessor (tests). If not, create or reuse engine context.
            ctx = this.cfg.getAudioContext?.();
            const eng = this.cfg.audioEngine ?? getAudioEngine();
            if (!ctx) {
                // Invoke ensureContext() but swallow rejection (e.g., test env without Web Audio API) to avoid unhandled promise rejections.
                try {
                    const maybePromise = (eng as any).ensureContext?.();
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        maybePromise.catch(() => {
                            /* non-browser env: ignore */
                        });
                    }
                } catch {
                    /* ignore */
                }
                if (eng.isReady()) ctx = eng.getContext();
            }
            if (ctx) {
                this.state.playbackStartAudioTime = ctx.currentTime;
                this.state.source = 'audio';
                try {
                    // Fire-and-forget async start; any resume() inside is handled by AudioEngine.
                    (this.cfg.audioEngine ?? getAudioEngine()).playTick(tick);
                } catch {
                    this.state.source = 'clock';
                }
            } else {
                this.state.source = 'clock';
            }
        } catch {
            this.state.source = 'clock';
        }
        this.clock.setTick(tick);
        if (this.clock.isPaused) this.clock.resume(performance.now());
        this.state.mode = 'playing';
        this.emit();
    }

    pause() {
        if (this.state.mode === 'paused') return;
        this.clock.pause(performance.now());
        // Stop audio sources but keep context (resume faster next play)
        try {
            (this.cfg.audioEngine ?? getAudioEngine()).stop();
        } catch {}
        this.state.mode = 'paused';
        this.emit();
    }

    seek(tick: number) {
        tick = Math.max(0, Math.floor(tick));
        this.state.startTick = tick;
        this.state.lastDerivedTick = tick;
        this.clock.setTick(tick);
        if (this.state.mode === 'playing' && this.state.source === 'audio') {
            try {
                (this.cfg.audioEngine ?? getAudioEngine()).seek(tick);
            } catch {}
        }
        this.emit();
    }

    updateFrame(nowPerfMs: number): number | undefined {
        if (this.state.mode !== 'playing') return undefined;
        if (this.state.source === 'audio') {
            let ctx = this.cfg.getAudioContext?.();
            if (!ctx) {
                try {
                    const eng = this.cfg.audioEngine ?? getAudioEngine();
                    if (eng.isReady()) ctx = eng.getContext();
                } catch {}
            }
            if (!ctx || this.state.playbackStartAudioTime == null) {
                this.state.source = 'clock';
            } else {
                const elapsed = ctx.currentTime - this.state.playbackStartAudioTime;
                if (elapsed >= 0) {
                    // Use precise float accumulation (no premature floor) then only truncate for emission comparison
                    const secondsPerBeat = this.tm.getSecondsPerBeat(elapsed);
                    const beats = elapsed / secondsPerBeat;
                    const ticksDelta = beats * this.tm.ticksPerQuarter;
                    const candidate = this.state.startTick + ticksDelta;
                    // Truncate only for integer canonical tick; retain fractional error internally by not mutating startTick.
                    const nextTick = Math.max(0, candidate | 0); // bitwise trunc faster & consistent
                    if (nextTick !== this.state.lastDerivedTick) {
                        // Guard against retrograde due to floating rounding (should not happen but defensive)
                        if (nextTick < this.state.lastDerivedTick) {
                            return undefined;
                        }
                        this.state.lastDerivedTick = nextTick;
                        this.emit();
                        try {
                            (this.cfg.audioEngine ?? getAudioEngine()).refresh(nextTick);
                        } catch {}
                        return nextTick;
                    }
                    return undefined;
                }
            }
        }
        if (this.clock.isPaused) this.clock.resume(nowPerfMs);
        const nextTick = this.clock.update(nowPerfMs);
        if (nextTick !== this.state.lastDerivedTick) {
            this.state.lastDerivedTick = nextTick;
            this.emit();
            return nextTick;
        }
        return undefined;
    }
}

let _singleton: TransportCoordinator | null = null;
export function getTransportCoordinator(cfg?: TransportCoordinatorConfig) {
    if (!_singleton) _singleton = new TransportCoordinator(cfg);
    return _singleton;
}
