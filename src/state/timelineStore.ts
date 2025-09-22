import create, { type StateCreator } from 'zustand';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import type { AudioTrack, AudioCacheEntry } from '@state/audioTypes';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import type { TempoMapEntry, NoteRaw } from '@state/timelineTypes';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { TimingManager } from '@core/timing';
import { parseMIDIFileToData } from '@core/midi/midi-library';

// Local helpers to avoid importing selectors (prevent circular deps)
function _secondsToBarsLocal(state: Partial<TimelineState> | undefined, seconds: number): number {
    const tl: any = state?.timeline || {};
    const bpb = tl.beatsPerBar || 4;
    const spbFallback = 60 / (tl.globalBpm || 120);
    const beats = secondsToBeats(tl.masterTempoMap, seconds, spbFallback);
    return beats / bpb;
}
function _barsToSecondsLocal(state: Partial<TimelineState> | undefined, bars: number): number {
    const tl: any = state?.timeline || {};
    const bpb = tl.beatsPerBar || 4;
    const spbFallback = 60 / (tl.globalBpm || 120);
    const beats = bars * bpb;
    return beatsToSeconds(tl.masterTempoMap, beats, spbFallback);
}

// Local helpers for beats<->seconds using current timeline tempo context
function _secondsToBeatsLocal(state: Partial<TimelineState> | undefined, seconds: number): number {
    const tl: any = state?.timeline || {};
    const spbFallback = 60 / (tl.globalBpm || 120);
    return secondsToBeats(tl.masterTempoMap, seconds, spbFallback);
}
function _beatsToSecondsLocal(state: Partial<TimelineState> | undefined, beats: number): number {
    const tl: any = state?.timeline || {};
    const spbFallback = 60 / (tl.globalBpm || 120);
    return beatsToSeconds(tl.masterTempoMap, beats, spbFallback);
}

// Timeline base types
// Types are now in timelineTypes.ts

export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    // Canonical time domain fields
    offsetTicks: number; // canonical track offset in ticks
    // Optional region limits expressed in ticks (inclusive start, exclusive end semantics TBD)
    regionStartTick?: number;
    regionEndTick?: number;
    midiSourceId?: string; // references midiCache key
};

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTick: number; // canonical playhead position in ticks
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user'; // last domain that authored the playhead
    };
    tracks: Record<string, TimelineTrack | AudioTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number; // canonical loop start
        loopEndTick?: number; // canonical loop end
        rate: number; // playback rate factor (inactive until wired to visualizer/worker)
        quantize: 'off' | 'bar'; // toggle bar quantization on/off
    };
    selection: { selectedTrackIds: string[] };
    // UI view window in ticks
    timelineView: { startTick: number; endTick: number };
    // Real playback range braces (yellow) in ticks. Optional; when unset, fallback to timelineView.
    playbackRange?: { startTick?: number; endTick?: number };
    // Marks that user explicitly set the playbackRange (scene start/end). When false, system may auto-adjust
    playbackRangeUserDefined: boolean;
    midiCache: Record<
        string,
        { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    >;
    audioCache: Record<string, AudioCacheEntry>;
    // UI preferences
    rowHeight: number; // track row height in px

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) => Promise<string>;
    addAudioTrack: (input: {
        name: string;
        file?: File;
        buffer?: AudioBuffer;
        offsetTicks?: number;
    }) => Promise<string>;
    removeTrack: (id: string) => void;
    removeTracks: (ids: string[]) => void; // batch removal (single undo snapshot)
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => void;
    setTrackOffsetTicks: (id: string, offsetTicks: number) => void;
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => void;
    setTrackEnabled: (id: string, enabled: boolean) => void;
    setTrackMute: (id: string, mute: boolean) => void;
    setTrackSolo: (id: string, solo: boolean) => void;
    setTrackGain: (id: string, gain: number) => void; // audio only
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTick: (tick: number, authority?: 'tick' | 'seconds' | 'clock' | 'user') => void; // dual-write API
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekTick: (tick: number) => void;
    scrubTick: (tick: number) => void;
    setRate: (rate: number) => void;
    setQuantize: (q: 'off' | 'bar') => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRangeTicks: (startTick?: number, endTick?: number) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => void;
    setTimelineViewTicks: (startTick: number, endTick: number) => void;
    selectTracks: (ids: string[]) => void;
    setPlaybackRangeTicks: (startTick?: number, endTick?: number) => void;
    setPlaybackRangeExplicitTicks: (startTick?: number, endTick?: number) => void;
    setRowHeight: (h: number) => void;
    ingestMidiToCache: (
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) => void;
    ingestAudioToCache: (id: string, buffer: AudioBuffer) => void;
    clearAllTracks: () => void;
};

// Utility to create IDs
function makeId(prefix: string = 'trk'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Compute content bounds purely in tick domain. Offsets are incorporated by adding track.offsetTicks.
function computeContentEndTick(state: TimelineState): number {
    let max = 0;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id] as any;
        if (!t || !t.enabled) continue;
        if (t.type === 'midi') {
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            for (const n of cache.notesRaw) {
                const endTick = n.endTick + t.offsetTicks;
                if (endTick > max) max = endTick;
            }
        } else if (t.type === 'audio') {
            const cacheKey = t.audioSourceId ?? id;
            const acache = state.audioCache[cacheKey];
            if (!acache) continue;
            const clipEnd = (t.regionEndTick ?? acache.durationTicks) + t.offsetTicks;
            if (clipEnd > max) max = clipEnd;
        }
    }
    return max;
}

function computeContentStartTick(state: TimelineState): number {
    let min = Infinity;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id] as any;
        if (!t || !t.enabled) continue;
        if (t.type === 'midi') {
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            for (const n of cache.notesRaw) {
                const startTick = n.startTick + t.offsetTicks;
                if (startTick < min) min = startTick;
            }
        } else if (t.type === 'audio') {
            const cacheKey = t.audioSourceId ?? id;
            const acache = state.audioCache[cacheKey];
            if (!acache) continue;
            const regionStart = t.regionStartTick ?? 0;
            const clipStart = regionStart + t.offsetTicks;
            if (clipStart < min) min = clipStart;
        }
    }
    if (!isFinite(min)) return 0;
    return Math.max(0, min);
}

function computeContentBoundsTicks(state: TimelineState): { start: number; end: number } | null {
    const end = computeContentEndTick(state);
    if (!isFinite(end) || end <= 0) return null;
    const start = computeContentStartTick(state);
    return { start, end };
}

// Internal helper to auto-adjust scene range + zoom if user hasn't explicitly set it
function autoAdjustSceneRangeIfNeeded(get: () => TimelineState, set: (fn: any) => void) {
    const s = get();
    if (s.playbackRangeUserDefined) return;
    const bounds = computeContentBoundsTicks(s);
    if (!bounds) return;
    const { start, end } = bounds;
    const current = s.playbackRange || {};
    const same = Math.abs((current.startTick ?? -1) - start) < 1 && Math.abs((current.endTick ?? -1) - end) < 1;
    if (same) return;
    const oneBarBeats = s.timeline.beatsPerBar;
    const oneBarTicks = _beatsToTicks(oneBarBeats);
    // Cap to at most 960 bars previously caused scaling issues with mixed PPQ values; instead cap to 200 bars (~content heuristic)
    const maxBars = 200;
    const clippedEnd = Math.min(end, start + oneBarTicks * maxBars);
    // Apply initial auto range and mark as user-defined so it will not be re-auto-adjusted on subsequent track edits.
    // This matches the desired UX: first import defines an implicit start/end that behaves like an explicit user choice.
    set((prev: TimelineState) => ({
        playbackRange: { startTick: start, endTick: clippedEnd + oneBarTicks },
        timelineView: { startTick: Math.max(0, start - oneBarTicks), endTick: clippedEnd + oneBarTicks * 2 },
        playbackRangeUserDefined: true,
    }));
}

// Shared singleton timing manager; we assume constant PPQ here; future work may make PPQ configurable.
// Exported so that all runtime systems (VisualizerContext, PlaybackClock, UI rulers, selectors) share tempo state.
const _tmSingleton = new TimingManager();
export function getSharedTimingManager() {
    return _tmSingleton;
}
export { _tmSingleton as sharedTimingManager }; // named export for direct import convenience
function _beatsToTicks(beats: number): number {
    return Math.round(beats * _tmSingleton.ticksPerQuarter);
}
function _ticksToBeats(ticks: number): number {
    return ticks / _tmSingleton.ticksPerQuarter;
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    timeline: {
        id: 'tl_1',
        name: 'Main Timeline',
        currentTick: 0,
        globalBpm: 120,
        beatsPerBar: 4,
        playheadAuthority: 'tick',
    },
    tracks: {},
    tracksOrder: [],
    audioCache: {},
    transport: {
        state: 'idle',
        isPlaying: false,
        loopEnabled: false,
        rate: 1.0,
        // Quantize enabled by default (bar snapping)
        quantize: 'bar',
        loopStartTick: _beatsToTicks(_secondsToBeatsLocal(undefined, 2)), // initial value derived from seconds helper
        loopEndTick: _beatsToTicks(_secondsToBeatsLocal(undefined, 5)),
    },
    selection: { selectedTrackIds: [] },
    midiCache: {},
    timelineView: { startTick: 0, endTick: _beatsToTicks(120) },
    playbackRange: undefined,
    playbackRangeUserDefined: false,
    rowHeight: 30,

    async addMidiTrack(input: {
        name: string;
        file?: File;
        midiData?: MIDIData;
        offsetTicks?: number;
        // Only offsetTicks accepted (seconds/beat offsets removed)
    }) {
        const id = makeId();
        const s = get();
        let initialOffsetTicks = input.offsetTicks ?? 0;
        const track: TimelineTrack = {
            id,
            name: input.name || 'MIDI Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: initialOffsetTicks,
        };

        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: track },
            tracksOrder: [...s.tracksOrder, id],
        }));
        // Auto adjust after adding track (before/after ingestion)
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}

        // If MIDI data provided, ingest immediately. (File-based ingestion UI deferred)
        if (input.midiData) {
            const ingested = buildNotesFromMIDI(input.midiData);
            get().ingestMidiToCache(id, ingested);
            set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], midiSourceId: id } } }));
            try {
                autoAdjustSceneRangeIfNeeded(get, set);
            } catch {}
        } else if (input.file) {
            const midiData = await parseMIDIFileToData(input.file);
            const ingested = buildNotesFromMIDI(midiData);
            get().ingestMidiToCache(id, ingested);
            set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], midiSourceId: id } } }));
            try {
                autoAdjustSceneRangeIfNeeded(get, set);
            } catch {}
        }

        // Notify UI that a new track was added (for auto-binding defaults)
        try {
            window.dispatchEvent(new CustomEvent('timeline-track-added', { detail: { trackId: id } }));
        } catch {}
        return id;
    },
    async addAudioTrack(input: { name: string; file?: File; buffer?: AudioBuffer; offsetTicks?: number }) {
        const id = makeId('aud');
        const initialOffsetTicks = input.offsetTicks ?? 0;
        const track: AudioTrack = {
            id,
            name: input.name || 'Audio Track',
            type: 'audio',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: initialOffsetTicks,
            gain: 1,
        };
        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: track },
            tracksOrder: [...s.tracksOrder, id],
        }));
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}

        const ensureBuffer = async () => {
            if (input.buffer) {
                get().ingestAudioToCache(id, input.buffer);
                return;
            }
            if (input.file) {
                try {
                    // Lazy decode using web audio
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const arrayBuf = await input.file.arrayBuffer();
                    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
                    get().ingestAudioToCache(id, decoded);
                } catch (err) {
                    console.warn('Audio decode failed', err);
                }
            }
        };
        ensureBuffer().then(() => {
            try {
                autoAdjustSceneRangeIfNeeded(get, set);
            } catch {}
            try {
                window.dispatchEvent(new CustomEvent('timeline-track-added', { detail: { trackId: id } }));
            } catch {}
        });
        return id;
    },

    removeTrack(id: string) {
        set((s: TimelineState) => {
            const { [id]: _, ...rest } = s.tracks;
            // Remove associated audio cache if audio track
            let newAudioCache = s.audioCache;
            const t: any = s.tracks[id];
            if (t && t.type === 'audio') {
                const cacheKey = t.audioSourceId || id;
                const { [cacheKey]: __, ...cacheRest } = s.audioCache;
                newAudioCache = cacheRest;
            }
            return {
                tracks: rest,
                tracksOrder: s.tracksOrder.filter((t: string) => t !== id),
                selection: {
                    selectedTrackIds: s.selection.selectedTrackIds.filter((t: string) => t !== id),
                },
                audioCache: newAudioCache,
            };
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    // Batch removal utility so multi-delete (keyboard) produces a single state update & undo snapshot.
    removeTracks(ids: string[]) {
        if (!ids || !ids.length) return;
        set((s: TimelineState) => {
            const idSet = new Set(ids);
            // Build new tracks map excluding ids
            const newTracks: Record<string, any> = {};
            for (const k in s.tracks) {
                if (!idSet.has(k)) newTracks[k] = s.tracks[k];
            }
            // Remove audio cache entries for removed audio tracks
            let newAudioCache = { ...s.audioCache } as Record<string, any>;
            for (const id of ids) {
                const t: any = s.tracks[id];
                if (t && t.type === 'audio') {
                    const cacheKey = t.audioSourceId || id;
                    if (cacheKey in newAudioCache) {
                        const { [cacheKey]: _rm, ...restCache } = newAudioCache;
                        newAudioCache = restCache;
                    }
                }
            }
            return {
                tracks: newTracks,
                tracksOrder: s.tracksOrder.filter((t: string) => !idSet.has(t)),
                selection: { selectedTrackIds: s.selection.selectedTrackIds.filter((t: string) => !idSet.has(t)) },
                audioCache: newAudioCache,
            } as TimelineState;
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    updateTrack(id: string, patch: Partial<TimelineTrack>) {
        // Only offsetTicks is honored; any removed fields are ignored
        set((s: TimelineState) => {
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as TimelineState;
            let next: TimelineTrack = { ...prev } as TimelineTrack;
            if (typeof patch.offsetTicks === 'number') {
                next.offsetTicks = patch.offsetTicks;
            }
            if (typeof patch.name === 'string') next.name = patch.name;
            if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
            if (typeof patch.mute === 'boolean') next.mute = patch.mute;
            if (typeof patch.solo === 'boolean') next.solo = patch.solo;
            if (typeof patch.regionStartTick === 'number') next.regionStartTick = patch.regionStartTick;
            if (typeof patch.regionEndTick === 'number') next.regionEndTick = patch.regionEndTick;
            return { tracks: { ...s.tracks, [id]: next } } as TimelineState;
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    setTrackOffsetTicks(id: string, offsetTicks: number) {
        set((s: TimelineState) => {
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as TimelineState;
            const next = { ...prev, offsetTicks } as typeof prev;
            return { tracks: { ...s.tracks, [id]: next } } as TimelineState;
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    setTrackRegionTicks(id: string, startTick?: number, endTick?: number) {
        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: { ...s.tracks[id], regionStartTick: startTick, regionEndTick: endTick } },
        }));
    },

    setTrackEnabled(id: string, enabled: boolean) {
        set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], enabled } } }));
    },

    setTrackMute(id: string, mute: boolean) {
        set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], mute } } }));
    },

    setTrackSolo(id: string, solo: boolean) {
        set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], solo } } }));
    },
    setTrackGain(id: string, gain: number) {
        const g = Math.max(0, Math.min(2, gain));
        set((s: TimelineState) => {
            const prev: any = s.tracks[id];
            if (!prev || prev.type !== 'audio') return { tracks: s.tracks } as TimelineState;
            return { tracks: { ...s.tracks, [id]: { ...prev, gain: g } } } as TimelineState;
        });
    },

    setMasterTempoMap(map?: TempoMapEntry[]) {
        // When tempo map changes, recompute real-time seconds for beat-based notes in cache
        set((s: TimelineState) => {
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, masterTempoMap: map };
            // Propagate tempo map to shared timing manager for immediate effect in playback clock & UI
            try {
                _tmSingleton.setTempoMap(map, 'seconds');
            } catch {
                /* noop */
            }
            // Notes no longer store seconds; conversions happen in selectors.
            return next;
        });
    },

    setGlobalBpm(bpm: number) {
        const v = isFinite(bpm) && bpm > 0 ? bpm : 120;
        // Update global bpm and rescale note seconds if no tempo map (uniform tempo case)
        set((s: TimelineState) => {
            const hadMap = (s.timeline.masterTempoMap?.length || 0) > 0;
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, globalBpm: v };
            // Propagate BPM to shared timing manager so playback rate updates immediately
            try {
                _tmSingleton.setBPM(v);
            } catch {
                /* ignore */
            }
            // If a tempo map is present we keep its segment BPMs; only fallback bpm changes effect conversions when map empty.
            // Seconds no longer stored on notes; real-time updates occur via selectors.
            // Recompute audioCache durationTicks so displayed beat length and clip width scale with BPM.
            // Original audioBuffer duration (in seconds) is constant; ticksPerSecond = (bpm * ppq)/60.
            try {
                const ppq = _tmSingleton.ticksPerQuarter;
                const ticksPerSecond = (v * ppq) / 60;
                const updatedAudio: Record<string, AudioCacheEntry> = {} as any;
                for (const [id, entry] of Object.entries(next.audioCache)) {
                    if (!entry || !entry.audioBuffer) {
                        updatedAudio[id] = entry as any;
                        continue;
                    }
                    const newDurationTicks = Math.round(entry.audioBuffer.duration * ticksPerSecond);
                    updatedAudio[id] = { ...entry, durationTicks: newDurationTicks } as any;
                }
                next.audioCache = updatedAudio;
            } catch {
                /* noop */
            }
            return next;
        });
    },

    setBeatsPerBar(n: number) {
        const v = Math.max(1, Math.floor(n || 4));
        set((s: TimelineState) => ({ timeline: { ...s.timeline, beatsPerBar: v } }));
    },

    setCurrentTick(tick: number, authority: 'tick' | 'seconds' | 'clock' | 'user' = 'tick') {
        set((s: TimelineState) => {
            // Behavior goals:
            // 1. While paused, passive advancement originating from the running render loop / clock.update should not move the store tick.
            // 2. Explicit repositioning (seek/loop wrap) coming from the clock authority SHOULD update even while paused (e.g. tests calling setCurrentTick(500,'clock')).
            // Implementation: if paused and authority==='clock' but tick is identical to currentTick (passive frame), ignore; otherwise apply.
            let nextTick = Math.max(0, tick);
            if (authority === 'clock' && !s.transport.isPlaying && s.transport.state === 'paused') {
                if (nextTick === s.timeline.currentTick) {
                    return { timeline: { ...s.timeline } } as TimelineState; // no-op passive frame
                }
                // Allow change-through for explicit reposition while paused.
            }
            if (
                s.transport.loopEnabled &&
                typeof s.transport.loopStartTick === 'number' &&
                typeof s.transport.loopEndTick === 'number'
            ) {
                if (nextTick > s.transport.loopEndTick) {
                    nextTick = s.transport.loopStartTick;
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: nextTick, playheadAuthority: authority },
            } as TimelineState;
        });
    },

    play() {
        set((s: TimelineState) => {
            // Only apply bar quantization when entering play from a non-playing state AND not immediately after a pause.
            // Previous logic snapped on every play(), so toggling pause/play could shift the playhead forward a bar
            // (observed as a one-bar jump when pausing due to tick->seconds mirror race). We guard by detecting if
            // current tick is already aligned or if we were just playing.
            let curTick = s.timeline.currentTick;
            const wasPlaying = s.transport.isPlaying;
            if (!wasPlaying && s.transport.quantize === 'bar') {
                const ticksPerBar = _beatsToTicks(s.timeline.beatsPerBar);
                // Use floor so we never jump the playhead forward past the user's chosen position;
                // this eliminates the visible half-bar forward jump experienced with Math.round.
                const snapped = Math.floor(curTick / ticksPerBar) * ticksPerBar;
                if (snapped !== curTick) {
                    curTick = snapped;
                    // Notify runtime (VisualizerContext) to align playback clock
                    // VisualizerContext listens for 'timeline-play-snapped' and issues clock.setTick(snappedTick)
                    // ensuring the PlaybackClock fractional accumulator is cleared.
                    try {
                        window.dispatchEvent(new CustomEvent('timeline-play-snapped', { detail: { tick: curTick } }));
                    } catch {
                        /* ignore */
                    }
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: curTick },
                transport: { ...s.transport, isPlaying: true, state: 'playing' },
            } as TimelineState;
        });
    },
    pause() {
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: false, state: 'paused' } }));
    },
    togglePlay() {
        const wasPlaying = get().transport.isPlaying;
        // Resume from the current playhead position; do NOT jump to view start.
        // This preserves the user's last seek/paused position when starting playback.
        set((s: TimelineState) => ({
            transport: { ...s.transport, isPlaying: !wasPlaying, state: !wasPlaying ? 'playing' : 'paused' },
        }));
    },
    seekTick(tick: number) {
        set((s: TimelineState) => ({
            timeline: { ...s.timeline, currentTick: Math.max(0, tick), playheadAuthority: 'user' },
            transport: { ...s.transport, state: 'seeking' },
        }));
    },
    scrubTick(tick: number) {
        get().setCurrentTick(tick, 'user');
    },

    setRate(rate: number) {
        const r = isFinite(rate) && rate > 0 ? rate : 1.0;
        set((s: TimelineState) => ({ transport: { ...s.transport, rate: r } }));
    },

    setQuantize(q: 'off' | 'bar') {
        const v: 'off' | 'bar' = q === 'bar' ? 'bar' : 'off';
        set((s: TimelineState) => ({ transport: { ...s.transport, quantize: v } }));
    },

    setLoopEnabled(enabled: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: enabled } }));
    },
    setLoopRangeTicks(startTick?: number, endTick?: number) {
        set((s: TimelineState) => ({
            transport: {
                ...s.transport,
                loopStartTick: startTick ?? s.transport.loopStartTick,
                loopEndTick: endTick ?? s.transport.loopEndTick,
            },
        }));
    },

    toggleLoop() {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } }));
    },

    reorderTracks(order: string[]) {
        set(() => ({ tracksOrder: [...order] }));
    },

    setTimelineViewTicks(startTick: number, endTick: number) {
        const MIN = 1; // at least 1 tick
        let sT = Math.min(startTick, endTick);
        let eT = Math.max(startTick, endTick);
        if (eT - sT < MIN) eT = sT + MIN;
        set(() => ({ timelineView: { startTick: sT, endTick: eT } }));
    },

    selectTracks(ids: string[]) {
        set(() => ({ selection: { selectedTrackIds: [...ids] } }));
    },

    ingestMidiToCache(
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) {
        // Update cache; convert beat-based canonical timing to seconds according to current tempo context
        set((s: TimelineState) => {
            const spbFallback = 60 / (s.timeline.globalBpm || 120);
            const map = s.timeline.masterTempoMap;
            const notes = data.notesRaw.map((n) => {
                if (n.startBeat !== undefined && n.endBeat !== undefined) {
                    const startSec = beatsToSeconds(map, n.startBeat, spbFallback);
                    const endSec = beatsToSeconds(map, n.endBeat, spbFallback);
                    return { ...n, startTime: startSec, endTime: endSec, duration: Math.max(0, endSec - startSec) };
                }
                return n;
            });
            return { midiCache: { ...s.midiCache, [id]: { ...data, notesRaw: notes } } } as TimelineState;
        });
        // Now that notes are available, attempt auto adjust (if not user-defined)
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    ingestAudioToCache(id: string, buffer: AudioBuffer) {
        // Compute duration in ticks using shared timing manager
        try {
            const ticksPerQuarter = _tmSingleton.ticksPerQuarter; // PPQ
            // Derive BPM from store timeline globalBpm (since TimingManager may not expose ticksPerSecond directly)
            const bpm = get().timeline.globalBpm || 120;
            const ticksPerSecond = (bpm * ticksPerQuarter) / 60;
            const durationTicks = Math.round(buffer.duration * ticksPerSecond);
            set((s: TimelineState) => ({
                audioCache: {
                    ...s.audioCache,
                    [id]: {
                        audioBuffer: buffer,
                        durationTicks,
                        sampleRate: buffer.sampleRate,
                        channels: buffer.numberOfChannels,
                        peakData: undefined, // filled async
                    },
                },
                tracks: {
                    ...s.tracks,
                    [id]: { ...(s.tracks[id] as any), audioSourceId: id },
                },
            }));
            // Kick off async peak extraction (non-blocking)
            (async () => {
                try {
                    const { extractPeaksAsync } = await import('@audio/waveform/peak-extractor');
                    const res = await extractPeaksAsync(buffer, { binSize: 1024, maxBins: 5000 });
                    set((s: TimelineState) => {
                        const existing = s.audioCache[id];
                        if (!existing || existing.peakData) return { audioCache: s.audioCache } as TimelineState;
                        return {
                            audioCache: {
                                ...s.audioCache,
                                [id]: { ...existing, peakData: res.peaks },
                            },
                        } as TimelineState;
                    });
                } catch (err) {
                    // Peak extraction failure is non-fatal.
                    // console.debug('Peak extraction skipped', err);
                }
            })();
        } catch (err) {
            console.warn('Failed to ingest audio buffer', err);
        }
    },

    clearAllTracks() {
        set((s: TimelineState) => ({
            tracks: {},
            tracksOrder: [],
            selection: { selectedTrackIds: [] },
            midiCache: {},
            audioCache: {},
        }));
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    setPlaybackRangeTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
        }));
    },
    setPlaybackRangeExplicitTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
            playbackRangeUserDefined: true,
        }));
    },

    setRowHeight(h: number) {
        const minH = 16;
        const maxH = 160;
        const v = Math.max(minH, Math.min(maxH, Math.floor(h)));
        set(() => ({ rowHeight: v }));
    },
});

export const useTimelineStore = create<TimelineState>(storeImpl);

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);
