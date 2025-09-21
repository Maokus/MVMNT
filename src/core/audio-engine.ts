// AudioEngine - Phase 2 (initial implementation)
// Manages AudioContext lifecycle, decoding, and per-track scheduling (MVP: whole buffer playback aligned to timeline offset).
// Responsibilities:
// 1. Lazy-create AudioContext on first play (user gesture) via ensureContext().
// 2. Decode files -> AudioBuffer (delegated to browser).
// 3. Schedule audible audio tracks when transport enters playing mode, mapping timeline tick -> buffer offset.
// 4. Apply gain/mute/solo in real time without restarting sources when possible (MVP: each track uses GainNode; source restart only on seek or region change).
// 5. Provide playTick(tick) and stop() for TransportCoordinator integration.
// 6. Expose refresh(currentTick, audioTime) for per-frame lookahead scheduling (MVP minimal: ensure a playing source spanning needed time; future granular scheduling not yet implemented).
//
// Simplifications in this MVP step:
// - Each audio track uses a single AudioBufferSourceNode per play session (recreated on seek/start).
// - No micro-fades yet (Phase 5).
// - Region trimming done via start offset / duration arguments to start().
// - Adaptive lookahead not implemented (fixed 0.2s constant reserved for future).
// - No waveform or offline mixing logic here (export path separate).
//
// Edge Cases / Error Handling:
// - If context is suspended (autoplay policy), playTick will attempt resume(). Failure leaves engine silent; caller may fallback to clock-driven mode.
// - Missing buffers: track skipped silently.
// - Solo logic: if any solo=true, only solo & enabled tracks considered audible.
//
// Future Extensions (documented for clarity):
// - Dynamic re-scheduling for partial window / streaming.
// - Micro-fade envelopes on seek to avoid clicks.
// - Per-track effects chain insertion.
// - OfflineAudioContext integration for deterministic export.
//
// Phase 2 Implementation Notes:
// - Current model intentionally simple: one BufferSource per audible track per play session.
// - Seeking triggers full recreation; acceptable for small N tracks (<10) and short buffers.
// - Gain/mute/solo updates mutate GainNode in-place with small smoothing constants.
// - Solo state change triggers a lightweight full reschedule (seek at lastPlayheadTick) to update audible set.
// - No attempt (yet) to keep phase continuity across seeks; micro-fades planned Phase 5.
// - refresh() is a no-op placeholder; future granular scheduling will populate lookahead logic here.

import { useTimelineStore } from '@state/timelineStore';
import type { AudioTrack } from '@state/audioTypes';

interface ActiveTrackNode {
    source: AudioBufferSourceNode;
    gainNode: GainNode;
    startTick: number; // transport tick we aligned this node at
    region: { startTick: number; endTick: number } | null; // trimming snapshot
}

export interface AudioEngineConfig {
    lookaheadSeconds?: number; // reserved for future incremental scheduling
}

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private cfg: Required<AudioEngineConfig>;
    private active: Map<string, ActiveTrackNode> = new Map();
    private lastPlayheadTick: number = 0; // last tick we initiated playback from
    private unsub?: () => void;
    // Phase 5 adaptive lookahead scaffolding
    private adaptive = {
        min: 0.15,
        max: 0.4,
        recentUnderruns: 0,
        windowChecks: 0,
    };

    constructor(cfg: AudioEngineConfig = {}) {
        this.cfg = { lookaheadSeconds: cfg.lookaheadSeconds ?? 0.2 };
        // Subscribe to store for gain/mute/solo updates; lightweight diff each change.
        try {
            let lastSnapshot: Record<string, { gain: number; mute: boolean; solo: boolean }> = {};
            this.unsub = useTimelineStore.subscribe((s) => {
                const next: typeof lastSnapshot = {};
                // Build new snapshot & detect changes for audio tracks only
                for (const id of s.tracksOrder) {
                    const t = s.tracks[id] as any;
                    if (!t || t.type !== 'audio') continue;
                    next[id] = { gain: t.gain, mute: t.mute, solo: t.solo };
                    const prev = lastSnapshot[id];
                    if (!prev || prev.gain !== t.gain) this.applyGain(id, t.gain);
                    if (!prev || prev.mute !== t.mute) this.applyMuteState(id, t.mute);
                }
                // If solo matrix changed (some track lost solo or new solo added) we need to recompute audible set.
                const soloChanged = Object.keys(next).some((id) => {
                    const prev = lastSnapshot[id];
                    return prev && prev.solo !== next[id].solo;
                });
                if (soloChanged && this.ctx) {
                    // Rebuild by restarting (simple approach). Future: optimize by muting only.
                    if (useTimelineStore.getState().transport.isPlaying) {
                        this.seek(this.lastPlayheadTick);
                    }
                }
                lastSnapshot = next;
            });
        } catch {
            /* ignore in non-browser/test env */
        }
    }

    isReady(): boolean {
        return !!this.ctx;
    }

    getContext(): AudioContext {
        if (!this.ctx) throw new Error('AudioContext not initialized');
        return this.ctx!; // non-null after guard
    }

    async ensureContext(): Promise<AudioContext> {
        if (this.ctx) return this.ctx as AudioContext;
        const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) throw new Error('Web Audio API not supported');
        this.ctx = new Ctor();
        return this.ctx as AudioContext;
    }

    async decodeFile(file: File): Promise<AudioBuffer> {
        const ctx = await this.ensureContext();
        const arr = await file.arrayBuffer();
        return await ctx.decodeAudioData(arr.slice(0));
    }

    /**
     * Begin playback aligned so that transport tick = playFromTick becomes currentTime of context.
     * We schedule / start all audible track sources fresh.
     */
    async playTick(playFromTick: number) {
        this.lastPlayheadTick = playFromTick;
        const ctx = await this.ensureContext();
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch {
                /* ignore */
            }
        }
        this.stopAllSources();
        this.startAudibleSources(playFromTick);
    }

    stop() {
        this.stopAllSources();
    }

    dispose() {
        try {
            this.unsub?.();
        } catch {}
        this.stopAllSources();
        try {
            this.ctx?.close();
        } catch {}
        this.ctx = null as any;
    }

    /** Called by TransportCoordinator on seek while playing. */
    async seek(playFromTick: number) {
        if (!this.ctx) return; // nothing to do
        this.lastPlayheadTick = playFromTick;
        // Recreate sources at new timeline position
        this.stopAllSources();
        this.startAudibleSources(playFromTick);
    }

    /** Apply gain change realtime if node exists */
    applyGain(trackId: string, gain: number) {
        const node = this.active.get(trackId);
        if (node) {
            const g = Math.max(0, Math.min(2, gain));
            node.gainNode.gain.setTargetAtTime(g, this.ctx!.currentTime, 0.01);
        }
    }

    applyMuteState(trackId: string, muted: boolean) {
        const node = this.active.get(trackId);
        if (node) {
            node.gainNode.gain.setTargetAtTime(
                muted ? 0 : (useTimelineStore.getState().tracks[trackId] as any).gain ?? 1,
                this.ctx!.currentTime,
                0.005
            );
        }
    }

    /** For future incremental scheduling; currently ensures any missing sources are started. */
    refresh(currentTick: number) {
        // Adaptive lookahead placeholder: increment window checks and periodically adjust.
        // In current whole-buffer model we cannot detect real underruns; hook left for future granular scheduling.
        this.adaptive.windowChecks++;
        if (this.adaptive.windowChecks % 300 === 0) {
            // Every ~300 frames (~5s at 60fps) decay underrun counter
            this.adaptive.recentUnderruns = Math.max(0, this.adaptive.recentUnderruns - 1);
            this.recomputeLookahead();
        }
    }

    /** External hook (future) to report scheduling underrun */
    reportUnderrun() {
        this.adaptive.recentUnderruns++;
        this.recomputeLookahead();
    }

    private recomputeLookahead() {
        const severity = this.adaptive.recentUnderruns;
        // Map severity 0..10 -> lookahead range min..max
        const clamped = Math.min(10, Math.max(0, severity));
        const span = this.adaptive.max - this.adaptive.min;
        const next = this.adaptive.min + (span * clamped) / 10;
        if (Math.abs(this.cfg.lookaheadSeconds - next) > 0.005) {
            this.cfg.lookaheadSeconds = next;
            // Dev-only debug event
            try {
                window.dispatchEvent(
                    new CustomEvent('audio-lookahead-adjusted', { detail: { lookahead: next, severity } })
                );
            } catch {}
        }
    }

    /** Test / debug helper (non-production critical) */
    getActiveTrackIds(): string[] {
        return Array.from(this.active.keys());
    }

    private getAudibleTracks(): AudioTrack[] {
        const s = useTimelineStore.getState();
        const tracks: AudioTrack[] = [];
        let anySolo = false;
        for (const id of s.tracksOrder) {
            const t = s.tracks[id] as any;
            if (!t || t.type !== 'audio') continue;
            if (t.solo) anySolo = true;
        }
        for (const id of s.tracksOrder) {
            const t = s.tracks[id] as any;
            if (!t || t.type !== 'audio') continue;
            if (!t.enabled) continue;
            if (anySolo && !t.solo) continue;
            tracks.push(t as AudioTrack);
        }
        return tracks;
    }

    private startAudibleSources(playFromTick: number) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const s = useTimelineStore.getState();
        const tm = { bpm: s.timeline.globalBpm, ppq: 960 }; // currently fixed PPQ
        const ticksPerSecond = (tm.bpm * tm.ppq) / 60;
        const audible = this.getAudibleTracks();
        audible.forEach((track) => {
            const cacheKey = track.audioSourceId || track.id;
            const cache = s.audioCache[cacheKey];
            if (!cache) return;
            const buffer = cache.audioBuffer;
            const regionStart = track.regionStartTick ?? 0;
            const regionEnd = track.regionEndTick ?? cache.durationTicks;
            if (regionEnd <= regionStart) return;
            // Compute where within the region we start based on playFromTick.
            const relativeTick = playFromTick - track.offsetTicks; // tick position inside the clip (possibly negative or beyond region)
            if (relativeTick >= regionEnd) return; // playback starts after clip end => silent
            const clippedRelTick = Math.max(relativeTick, regionStart);
            const offsetIntoRegionTicks = clippedRelTick - regionStart;
            if (offsetIntoRegionTicks < 0 || offsetIntoRegionTicks >= regionEnd - regionStart) return; // outside
            const offsetSeconds = offsetIntoRegionTicks / ticksPerSecond;
            const remainingTicks = regionEnd - clippedRelTick;
            const durationSeconds = remainingTicks / ticksPerSecond;

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gainNode = ctx.createGain();
            const targetGain = track.mute ? 0 : track.gain;
            // Micro-fade envelope (avoid clicks) 4ms default
            const fadeTime = 0.004;
            const now = ctx.currentTime;
            // Some test mocks may not implement automation methods; guard them.
            try {
                if (typeof (gainNode.gain as any).cancelScheduledValues === 'function') {
                    (gainNode.gain as any).cancelScheduledValues(now);
                }
                if (typeof gainNode.gain.setValueAtTime === 'function') {
                    gainNode.gain.setValueAtTime(0, now);
                } else {
                    (gainNode.gain as any).value = 0;
                }
                if (typeof gainNode.gain.linearRampToValueAtTime === 'function') {
                    gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeTime);
                } else if (typeof gainNode.gain.setTargetAtTime === 'function') {
                    gainNode.gain.setTargetAtTime(targetGain, now, fadeTime / 3);
                } else {
                    (gainNode.gain as any).value = targetGain;
                }
            } catch {
                // Fallback simple assignment
                (gainNode.gain as any).value = targetGain;
            }
            source.connect(gainNode).connect(ctx.destination);
            try {
                // Start at buffer position: regionStart offset + offsetSeconds
                const bufferRegionStartSeconds = regionStart / ticksPerSecond;
                const playbackBufferOffset = bufferRegionStartSeconds + offsetSeconds;
                const maxPlayable = buffer.duration - playbackBufferOffset;
                const dur = Math.min(durationSeconds, maxPlayable);
                source.start(ctx.currentTime, playbackBufferOffset, Math.max(0, dur));
            } catch (err) {
                console.warn('Failed to start audio source', err);
                try {
                    source.disconnect();
                    gainNode.disconnect();
                } catch {}
                return;
            }
            source.onended = () => {
                // Remove when naturally ends (if not already replaced by seek)
                if (this.active.get(track.id)?.source === source) {
                    this.active.delete(track.id);
                }
            };
            this.active.set(track.id, {
                source,
                gainNode,
                startTick: playFromTick,
                region: { startTick: regionStart, endTick: regionEnd },
            });
        });
    }

    private stopAllSources() {
        const fadeTime = 0.004;
        const ctx = this.ctx;
        const now = ctx ? ctx.currentTime : 0;
        this.active.forEach((node) => {
            try {
                if (ctx) {
                    // Fade out then stop slightly after to avoid clicks
                    try {
                        if (typeof (node.gainNode.gain as any).cancelScheduledValues === 'function') {
                            (node.gainNode.gain as any).cancelScheduledValues(now);
                        }
                        const current = (node.gainNode.gain as any).value ?? 0;
                        if (typeof node.gainNode.gain.setValueAtTime === 'function') {
                            node.gainNode.gain.setValueAtTime(current, now);
                        } else {
                            (node.gainNode.gain as any).value = current;
                        }
                        if (typeof node.gainNode.gain.linearRampToValueAtTime === 'function') {
                            node.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);
                        } else if (typeof node.gainNode.gain.setTargetAtTime === 'function') {
                            node.gainNode.gain.setTargetAtTime(0, now, fadeTime / 3);
                        } else {
                            (node.gainNode.gain as any).value = 0;
                        }
                    } catch {
                        (node.gainNode.gain as any).value = 0;
                    }
                    node.source.stop(now + fadeTime + 0.001);
                } else {
                    node.source.stop();
                }
            } catch {}
            try {
                node.source.disconnect();
            } catch {}
            try {
                node.gainNode.disconnect();
            } catch {}
        });
        this.active.clear();
    }
}

let _engine: AudioEngine | null = null;
export function getAudioEngine() {
    if (!_engine) _engine = new AudioEngine();
    return _engine;
}
