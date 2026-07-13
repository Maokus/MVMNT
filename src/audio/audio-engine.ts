// AudioEngine
// Manages AudioContext lifecycle, decoding, and per-track scheduling (current model: whole buffer playback aligned to timeline offset).
// Responsibilities:
// 1. Lazy-create AudioContext on first play (user gesture) via ensureContext().
// 2. Decode files -> AudioBuffer (delegated to browser).
// 3. Schedule audible audio tracks when transport enters playing mode, mapping timeline tick -> buffer offset.
// 4. Apply gain/mute/solo in real time without restarting sources when possible (MVP: each track uses GainNode; source restart only on seek or region change).
// 5. Provide playTick(tick) and stop() for TransportCoordinator integration.
// 6. Expose refresh(currentTick, audioTime) for per-frame lookahead scheduling (MVP minimal: ensure a playing source spanning needed time; future granular scheduling not yet implemented).
//
// Simplifications in current model:
// - Each audio track uses a single AudioBufferSourceNode per play session (recreated on seek/start).
// - Micro-fades limited to short fade-in/out envelopes on start/stop (click reduction); no cross-fade seek smoothing yet.
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
// Implementation Notes:
// - Current model intentionally simple: one BufferSource per audible track per play session.
// - Seeking triggers full recreation; acceptable for small N tracks (<10) and short buffers.
// - Gain/mute/solo updates mutate GainNode in-place with small smoothing constants.
// - Solo state change triggers a lightweight full reschedule (seek at lastPlayheadTick) to update audible set.
// - No attempt (yet) to keep phase continuity across seeks; acceptable for discrete clip playback use cases.
// - refresh() currently minimal; future granular scheduling will populate lookahead logic here.

import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { createTimingContext, secondsToTicks, ticksToSeconds } from '@state/timelineTime';
import { getAudioClipSourceBounds } from '@state/timeline/audioClips';
import type { AudioClip, AudioTrack } from '@audio/audioTypes';
import { getAudioClipsForTrack } from '@state/timeline/audioClips';

interface ActiveTrackNode {
    source: AudioBufferSourceNode;
    gainNode: GainNode;
    startTick: number; // transport tick we aligned this node at
    region: { startTick: number; endTick: number } | null; // trimming snapshot
    clipGain: number;
}

export interface AudioEngineConfig {
    lookaheadSeconds?: number; // reserved for future incremental scheduling
}

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private cfg: Required<AudioEngineConfig>;
    private active: Map<string, ActiveTrackNode> = new Map();
    private rehydratingSources: Set<string> = new Set();
    private playbackActive = false;
    private lastPlayheadTick: number = 0; // last tick we initiated playback from
    private unsub?: () => void;
    // Adaptive lookahead scaffolding (currently passive; future scheduling granularity may use this)

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
        this.playbackActive = true;
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
        const rehydration = this.rehydrateAudibleSourcesForPlayback();
        if (rehydration) await rehydration;
        this.startAudibleSources(playFromTick);
    }

    stop() {
        this.playbackActive = false;
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
        this.playbackActive = true;
        this.lastPlayheadTick = playFromTick;
        // Recreate sources at new timeline position
        this.stopAllSources();
        const rehydration = this.rehydrateAudibleSourcesForPlayback();
        if (rehydration) await rehydration;
        this.startAudibleSources(playFromTick);
    }

    /** Apply gain change realtime if node exists */
    applyGain(trackId: string, gain: number) {
        for (const [key, node] of this.active) {
            if (key !== trackId && !key.startsWith(`${trackId}:`)) continue;
            const g = Math.max(0, Math.min(2, gain)) * (node.clipGain ?? 1);
            const param = node.gainNode.gain as AudioParam & { value?: number };
            if (typeof param.setTargetAtTime === 'function') {
                param.setTargetAtTime(g, this.ctx!.currentTime, 0.01);
            } else if (typeof param.value === 'number') {
                param.value = g;
            }
        }
    }

    applyMuteState(trackId: string, muted: boolean) {
        for (const [key, node] of this.active) {
            if (key !== trackId && !key.startsWith(`${trackId}:`)) continue;
            const target = muted ? 0 : ((useTimelineStore.getState().tracks[trackId] as any).gain ?? 1) * (node.clipGain ?? 1);
            const param = node.gainNode.gain as AudioParam & { value?: number };
            if (typeof param.setTargetAtTime === 'function') {
                param.setTargetAtTime(target, this.ctx!.currentTime, 0.005);
            } else if (typeof param.value === 'number') {
                param.value = target;
            }
        }
    }

    /** For future incremental scheduling; currently ensures any missing sources are started. */
    refresh(_currentTick: number) {
        // no-op placeholder (previous adaptive lookahead scaffolding removed as unused)
    }

    /** Test / debug helper (non-production critical) */
    getActiveTrackIds(): string[] {
        return Array.from(new Set(Array.from(this.active.keys()).map((key) => key.split(':')[0])));
    }

    private getAudibleClips(): Array<{ track: AudioTrack; clip: AudioClip }> {
        const s = useTimelineStore.getState();
        const clips: Array<{ track: AudioTrack; clip: AudioClip }> = [];
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
            for (const clip of getAudioClipsForTrack(t as AudioTrack)) {
                if (clip.enabled === false) continue;
                clips.push({ track: t as AudioTrack, clip });
            }
        }
        return clips;
    }

    private startAudibleSources(playFromTick: number) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const s = useTimelineStore.getState();
        // Timeline positions are musical ticks; buffer offsets are immutable source seconds.
        const tmgr = getSharedTimingManager();
        const timingCtx = createTimingContext(
            { globalBpm: s.timeline.globalBpm, beatsPerBar: s.timeline.beatsPerBar, masterTempoMap: s.timeline.masterTempoMap },
            tmgr.ticksPerQuarter
        );
        const audible = this.getAudibleClips();
        audible.forEach(({ track, clip }) => {
            const cacheKey = clip.sourceId;
            const cache = s.audioCache[cacheKey];
            if (!cache) return;
            const buffer = cache.audioBuffer;
            if (!buffer) {
                this.rehydrateSourceForPlayback(cacheKey);
                return;
            }
            const sourceBounds = getAudioClipSourceBounds(s.audioCache, clip);
            if (!sourceBounds) return;
            const baseTimelineSeconds = ticksToSeconds(timingCtx, clip.offsetTicks || 0);
            const earliestAudibleSeconds = baseTimelineSeconds + sourceBounds.startSeconds;
            const regionEndSeconds = baseTimelineSeconds + sourceBounds.endSeconds;
            const playFromSeconds = ticksToSeconds(timingCtx, playFromTick);
            if (playFromSeconds >= regionEndSeconds) return;

            let whenTime = ctx.currentTime; // default immediate
            let playbackBufferOffsetSeconds = sourceBounds.startSeconds;

            if (playFromSeconds < earliestAudibleSeconds) {
                const delaySeconds = earliestAudibleSeconds - playFromSeconds;
                whenTime = ctx.currentTime + delaySeconds;
            } else {
                playbackBufferOffsetSeconds = sourceBounds.startSeconds + (playFromSeconds - earliestAudibleSeconds);
            }
            const durationSeconds = regionEndSeconds - (baseTimelineSeconds + playbackBufferOffsetSeconds);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gainNode = ctx.createGain();
            const targetGain = track.mute ? 0 : track.gain * (clip.gain ?? 1);
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
                // Start node; allow future whenTime if playback hasn't reached clip yet.
                const maxPlayable = buffer.duration - playbackBufferOffsetSeconds;
                const dur = Math.min(durationSeconds, maxPlayable);
                if (dur <= 0) throw new Error('Non-positive duration');
                source.start(whenTime, playbackBufferOffsetSeconds, Math.max(0, dur));
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
                const activeKey = `${track.id}:${clip.id}`;
                if (this.active.get(activeKey)?.source === source) {
                    this.active.delete(activeKey);
                }
            };
            this.active.set(`${track.id}:${clip.id}`, {
                source,
                gainNode,
                startTick: playFromSeconds < earliestAudibleSeconds ? Math.round(secondsToTicks(timingCtx, earliestAudibleSeconds)) : playFromTick,
                region: {
                    startTick: Math.round(secondsToTicks(timingCtx, earliestAudibleSeconds)),
                    endTick: Math.round(secondsToTicks(timingCtx, regionEndSeconds)),
                },
                clipGain: clip.gain ?? 1,
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

    private rehydrateSourceForPlayback(sourceId: string) {
        if (this.rehydratingSources.has(sourceId)) return;
        const store = useTimelineStore.getState();
        const entry = store.audioCache[sourceId];
        if (!entry || entry.decodedState === 'decoding') return;
        this.rehydratingSources.add(sourceId);
        void store.rehydrateAudioSource(sourceId).then((ready) => {
            this.rehydratingSources.delete(sourceId);
            if (!ready || !this.ctx) return;
            if (!this.playbackActive) return;
            const latest = useTimelineStore.getState();
            void this.seek(latest.timeline.currentTick ?? this.lastPlayheadTick);
        }).catch(() => {
            this.rehydratingSources.delete(sourceId);
        });
    }

    private rehydrateAudibleSourcesForPlayback(): Promise<unknown[]> | undefined {
        const missingSourceIds = new Set<string>();
        const state = useTimelineStore.getState();
        for (const { clip } of this.getAudibleClips()) {
            const entry = state.audioCache[clip.sourceId];
            if (entry && !entry.audioBuffer) {
                missingSourceIds.add(clip.sourceId);
            }
        }
        if (!missingSourceIds.size) return undefined;
        return Promise.all(
            Array.from(missingSourceIds).map((sourceId) => useTimelineStore.getState().rehydrateAudioSource(sourceId))
        );
    }
}

let _engine: AudioEngine | null = null;
export function getAudioEngine() {
    if (!_engine) _engine = new AudioEngine();
    return _engine;
}
