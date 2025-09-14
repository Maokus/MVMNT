import create, { type StateCreator } from 'zustand';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import { buildNotesFromMIDI } from '../core/midi/midi-ingest';
import type { TempoMapEntry, NoteRaw } from './timelineTypes';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { getSecondsPerBeat } from '@core/timing/tempo-utils';
import { TimingManager } from '@core/timing';

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

// Phase 1: Base types for the Timeline system
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
    // Legacy compatibility (Phase 4 shim) - derived mirrors
    offsetBeats?: number;
    offsetSec?: number;
    midiSourceId?: string; // references midiCache key
};

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTick: number; // canonical playhead position in ticks
        // Legacy derived seconds playhead (shim)
        currentTimeSec?: number;
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user'; // last domain that authored the playhead
    };
    tracks: Record<string, TimelineTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number; // canonical loop start
        loopEndTick?: number; // canonical loop end
        // Legacy loop seconds (shim)
        loopStartSec?: number;
        loopEndSec?: number;
        rate: number; // playback rate factor (inactive until wired to visualizer/worker)
        quantize: 'off' | 'bar'; // minimal Phase 2: toggle bar quantization on/off
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
    // UI preferences
    rowHeight: number; // track row height in px

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) => Promise<string>;
    removeTrack: (id: string) => void;
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => void;
    setTrackOffsetTicks: (id: string, offsetTicks: number) => void;
    // Legacy shims
    setTrackOffset: (id: string, offsetSec: number) => void;
    setTrackOffsetBeats: (id: string, offsetBeats: number) => void;
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => void;
    setTrackEnabled: (id: string, enabled: boolean) => void;
    setTrackMute: (id: string, mute: boolean) => void;
    setTrackSolo: (id: string, solo: boolean) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTick: (tick: number, authority?: 'tick' | 'seconds' | 'clock' | 'user') => void; // Phase 2 dual-write API
    // Legacy shim
    setCurrentTimeSec: (t: number, authority?: 'tick' | 'seconds' | 'clock' | 'user') => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekTick: (tick: number) => void;
    scrubTick: (tick: number) => void;
    // Legacy shims
    seek: (sec: number) => void;
    scrub: (sec: number) => void;
    setRate: (rate: number) => void;
    setQuantize: (q: 'off' | 'bar') => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRangeTicks: (startTick?: number, endTick?: number) => void;
    // Legacy shim
    setLoopRange: (start?: number, end?: number) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => void;
    setTimelineViewTicks: (startTick: number, endTick: number) => void;
    // Legacy shim
    setTimelineView: (start: number, end: number) => void;
    selectTracks: (ids: string[]) => void;
    setPlaybackRangeTicks: (startTick?: number, endTick?: number) => void;
    setPlaybackRangeExplicitTicks: (startTick?: number, endTick?: number) => void;
    // Legacy shims
    setPlaybackRange: (start?: number, end?: number) => void;
    setPlaybackRangeExplicit: (start?: number, end?: number) => void;
    setRowHeight: (h: number) => void;
    ingestMidiToCache: (
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) => void;
};

// Utility to create IDs
function makeId(prefix: string = 'trk'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Compute content bounds purely in tick domain (Phase 6+). Offsets are incorporated by adding track.offsetTicks.
function computeContentEndTick(state: TimelineState): number {
    let max = 0;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id];
        if (!t || t.type !== 'midi' || !t.enabled) continue;
        const cacheKey = t.midiSourceId ?? id;
        const cache = state.midiCache[cacheKey];
        if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
        for (const n of cache.notesRaw) {
            const endTick = n.endTick + t.offsetTicks;
            if (endTick > max) max = endTick;
        }
    }
    return max;
}

function computeContentStartTick(state: TimelineState): number {
    let min = Infinity;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id];
        if (!t || t.type !== 'midi' || !t.enabled) continue;
        const cacheKey = t.midiSourceId ?? id;
        const cache = state.midiCache[cacheKey];
        if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
        for (const n of cache.notesRaw) {
            const startTick = n.startTick + t.offsetTicks;
            if (startTick < min) min = startTick;
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
    set((prev: TimelineState) => ({
        playbackRange: { startTick: start, endTick: clippedEnd + oneBarTicks },
        timelineView: { startTick: Math.max(0, start - oneBarTicks), endTick: clippedEnd + oneBarTicks * 2 },
    }));
}

// Shared singleton timing manager (Phase 2): we assume constant PPQ here; later phases may make PPQ configurable.
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
    transport: {
        state: 'idle',
        isPlaying: false,
        loopEnabled: false,
        rate: 1.0,
        // Quantize enabled by default (bar snapping)
        quantize: 'bar',
        loopStartTick: _beatsToTicks(_secondsToBeatsLocal(undefined, 2)), // legacy init
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
        offsetSec?: number;
        offsetBeats?: number;
    }) {
        const id = makeId();
        const s = get();
        let initialOffsetTicks = input.offsetTicks ?? 0;
        if (typeof input.offsetSec === 'number' && input.offsetTicks == null && input.offsetBeats == null) {
            const beats = _secondsToBeatsLocal(s, input.offsetSec);
            initialOffsetTicks = _beatsToTicks(beats);
        } else if (typeof input.offsetBeats === 'number' && input.offsetTicks == null) {
            initialOffsetTicks = _beatsToTicks(input.offsetBeats);
        }
        const beats = _ticksToBeats(initialOffsetTicks);
        const sec = _beatsToSecondsLocal(s, beats);
        const track: TimelineTrack = {
            id,
            name: input.name || 'MIDI Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            offsetTicks: initialOffsetTicks,
            offsetBeats: beats,
            offsetSec: sec,
        };

        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: track },
            tracksOrder: [...s.tracksOrder, id],
        }));
        // Auto adjust after adding track (before/after ingestion)
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}

        // If MIDI data provided, ingest immediately. File-based ingestion will be wired later in Phase 2/4 UI.
        if (input.midiData) {
            const ingested = buildNotesFromMIDI(input.midiData);
            get().ingestMidiToCache(id, ingested);
            set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], midiSourceId: id } } }));
            try {
                autoAdjustSceneRangeIfNeeded(get, set);
            } catch {}
        } else if (input.file) {
            // Lazy parse using existing midi-library
            const { parseMIDIFileToData } = await import('@core/midi/midi-library');
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

    removeTrack(id: string) {
        set((s: TimelineState) => {
            const { [id]: _, ...rest } = s.tracks;
            return {
                tracks: rest,
                tracksOrder: s.tracksOrder.filter((t: string) => t !== id),
                selection: {
                    selectedTrackIds: s.selection.selectedTrackIds.filter((t: string) => t !== id),
                },
            };
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    updateTrack(id: string, patch: Partial<TimelineTrack>) {
        // Only ticks remain canonical; ignore legacy fields if accidentally passed
        set((s: TimelineState) => {
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as Partial<TimelineState> as TimelineState;
            let next: TimelineTrack = { ...prev, ...patch } as any;
            if (typeof patch.offsetTicks === 'number') {
                const beats = _ticksToBeats(patch.offsetTicks);
                const sec = _beatsToSecondsLocal(s, beats);
                next.offsetBeats = beats;
                next.offsetSec = sec;
            } else if (typeof patch.offsetBeats === 'number' && typeof patch.offsetTicks !== 'number') {
                const ticks = _beatsToTicks(patch.offsetBeats);
                const sec = _beatsToSecondsLocal(s, patch.offsetBeats);
                next.offsetTicks = ticks;
                next.offsetSec = sec;
            } else if (typeof patch.offsetSec === 'number' && typeof patch.offsetTicks !== 'number') {
                const beats = _secondsToBeatsLocal(s, patch.offsetSec);
                const ticks = _beatsToTicks(beats);
                next.offsetBeats = beats;
                next.offsetTicks = ticks;
            }
            return { tracks: { ...s.tracks, [id]: next } } as Partial<TimelineState> as TimelineState;
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    setTrackOffsetTicks(id: string, offsetTicks: number) {
        set((s: TimelineState) => {
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as Partial<TimelineState> as TimelineState;
            const beats = _ticksToBeats(offsetTicks);
            const sec = _beatsToSecondsLocal(s, beats);
            const next: TimelineTrack = { ...prev, offsetTicks, offsetBeats: beats, offsetSec: sec } as any;
            return { tracks: { ...s.tracks, [id]: next } } as Partial<TimelineState> as TimelineState;
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    // Legacy seconds-based offset setter
    setTrackOffset(id: string, offsetSec: number) {
        const s = get();
        const beats = _secondsToBeatsLocal(s, offsetSec);
        const ticks = _beatsToTicks(beats);
        get().setTrackOffsetTicks(id, ticks);
    },
    // Legacy beats-based offset setter
    setTrackOffsetBeats(id: string, offsetBeats: number) {
        const ticks = _beatsToTicks(offsetBeats);
        get().setTrackOffsetTicks(id, ticks);
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
            // Phase 6: notes no longer store seconds; conversions happen in selectors.
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
            // Phase 6: seconds no longer stored on notes; real-time updates occur via selectors.
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
    // Legacy seconds-based setter (quantize & looping will be handled outside; this just sets)
    setCurrentTimeSec(t: number, authority: 'tick' | 'seconds' | 'clock' | 'user' = 'seconds') {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn(
                    '[timelineStore] setCurrentTimeSec is deprecated; use setCurrentTick after converting seconds to ticks.'
                );
            } catch {
                /* ignore */
            }
        }
        const s = get();
        const spb = 60 / (s.timeline.globalBpm || 120);
        const beats = secondsToBeats(s.timeline.masterTempoMap, t, spb);
        const tickVal = _beatsToTicks(beats);
        set(
            (prev: TimelineState) =>
                ({
                    timeline: {
                        ...prev.timeline,
                        currentTick: tickVal,
                        currentTimeSec: t,
                        playheadAuthority: authority,
                    },
                } as TimelineState)
        );
        set((s2: TimelineState) => {
            if (
                s2.transport.loopEnabled &&
                typeof s2.transport.loopStartTick === 'number' &&
                typeof s2.transport.loopEndTick === 'number' &&
                s2.timeline.currentTick > s2.transport.loopEndTick
            ) {
                const startBeats = s2.transport.loopStartTick / _tmSingleton.ticksPerQuarter;
                const spb2 = 60 / (s2.timeline.globalBpm || 120);
                const loopStartSec = beatsToSeconds(s2.timeline.masterTempoMap, startBeats, spb2);
                return {
                    timeline: {
                        ...s2.timeline,
                        currentTick: s2.transport.loopStartTick,
                        currentTimeSec: loopStartSec,
                        playheadAuthority: authority,
                    },
                } as TimelineState;
            }
            return s2;
        });
    },

    play() {
        set((s: TimelineState) => {
            // Only apply bar quantization when entering play from a non-playing state AND not immediately after a pause.
            // Previous logic snapped on every play(), so toggling pause/play could shift the playhead forward a bar
            // (observed as a one-bar jump when pausing due to tick->seconds mirror race). We guard by detecting if
            // current tick is already aligned or if we were just playing.
            let curTick = s.timeline.currentTick;
            let curSec = s.timeline.currentTimeSec;
            const wasPlaying = s.transport.isPlaying;
            if (!wasPlaying && s.transport.quantize === 'bar') {
                const ticksPerBar = _beatsToTicks(s.timeline.beatsPerBar);
                // Use floor so we never jump the playhead forward past the user's chosen position;
                // this eliminates the visible half-bar forward jump experienced with Math.round.
                const snapped = Math.floor(curTick / ticksPerBar) * ticksPerBar;
                if (snapped !== curTick) {
                    curTick = snapped;
                    const beats = curTick / _tmSingleton.ticksPerQuarter;
                    const spb = 60 / (s.timeline.globalBpm || 120);
                    curSec = beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
                    // Notify runtime (VisualizerContext) to align playback clock
                    // VisualizerContext listens for 'timeline-play-snapped' and issues clock.setTick(snappedTick)
                    // ensuring the PlaybackClock fractional accumulator is cleared (Phase 2 requirement #5).
                    try {
                        window.dispatchEvent(new CustomEvent('timeline-play-snapped', { detail: { tick: curTick } }));
                    } catch {
                        /* ignore */
                    }
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: curTick, currentTimeSec: curSec },
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
    // Legacy seconds seek (with bar quantize if enabled)
    seek(sec: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn('[timelineStore] seek(seconds) is deprecated; convert to ticks and call seekTick.');
            } catch {
                /* ignore */
            }
        }
        set((s: TimelineState) => {
            let target = Math.max(0, sec);
            if (s.transport.quantize === 'bar') {
                const bars = _secondsToBarsLocal(s, target);
                const snapped = Math.round(bars);
                target = _barsToSecondsLocal(s, snapped);
            }
            const spb = 60 / (s.timeline.globalBpm || 120);
            const beats = secondsToBeats(s.timeline.masterTempoMap, target, spb);
            const tickVal = _beatsToTicks(beats);
            return {
                timeline: { ...s.timeline, currentTick: tickVal, currentTimeSec: target },
                transport: { ...s.transport, state: 'seeking' },
            } as TimelineState;
        });
    },
    scrub(sec: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn('[timelineStore] scrub(seconds) is deprecated; convert to ticks and call scrubTick.');
            } catch {
                /* ignore */
            }
        }
        get().setCurrentTimeSec(sec, 'user');
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
        set((s: TimelineState) => {
            return {
                transport: {
                    ...s.transport,
                    loopStartTick: startTick ?? s.transport.loopStartTick,
                    loopEndTick: endTick ?? s.transport.loopEndTick,
                    loopStartSec:
                        typeof startTick === 'number'
                            ? _beatsToSecondsLocal(s, _ticksToBeats(startTick))
                            : s.transport.loopStartSec,
                    loopEndSec:
                        typeof endTick === 'number'
                            ? _beatsToSecondsLocal(s, _ticksToBeats(endTick))
                            : s.transport.loopEndSec,
                },
            } as TimelineState;
        });
    },
    // Legacy seconds-based loop range setter
    setLoopRange(start?: number, end?: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn(
                    '[timelineStore] setLoopRange(seconds) is deprecated; convert to ticks and call setLoopRangeTicks.'
                );
            } catch {
                /* ignore */
            }
        }
        const s = get();
        const startBeats = typeof start === 'number' ? _secondsToBeatsLocal(s, start) : undefined;
        const endBeats = typeof end === 'number' ? _secondsToBeatsLocal(s, end) : undefined;
        const startTick = typeof startBeats === 'number' ? _beatsToTicks(startBeats) : undefined;
        const endTick = typeof endBeats === 'number' ? _beatsToTicks(endBeats) : undefined;
        set((prev: TimelineState) => ({
            transport: {
                ...prev.transport,
                loopStartTick: startTick ?? prev.transport.loopStartTick,
                loopEndTick: endTick ?? prev.transport.loopEndTick,
                loopStartSec: typeof start === 'number' ? start : prev.transport.loopStartSec,
                loopEndSec: typeof end === 'number' ? end : prev.transport.loopEndSec,
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
    // Legacy seconds-based view setter
    setTimelineView(start: number, end: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn('[timelineStore] setTimelineView(seconds) is deprecated; use setTimelineViewTicks.');
            } catch {
                /* ignore */
            }
        }
        const s = get();
        const spb = 60 / (s.timeline.globalBpm || 120);
        const beatsStart = secondsToBeats(s.timeline.masterTempoMap, start, spb);
        const beatsEnd = secondsToBeats(s.timeline.masterTempoMap, end, spb);
        get().setTimelineViewTicks(_beatsToTicks(beatsStart), _beatsToTicks(beatsEnd));
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
    // Legacy playback range seconds setters
    setPlaybackRange(start?: number, end?: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn('[timelineStore] setPlaybackRange(seconds) is deprecated; use setPlaybackRangeTicks.');
            } catch {
                /* ignore */
            }
        }
        const s = get();
        const startBeats = typeof start === 'number' ? _secondsToBeatsLocal(s, start) : undefined;
        const endBeats = typeof end === 'number' ? _secondsToBeatsLocal(s, end) : undefined;
        get().setPlaybackRangeTicks(
            typeof startBeats === 'number' ? _beatsToTicks(startBeats) : undefined,
            typeof endBeats === 'number' ? _beatsToTicks(endBeats) : undefined
        );
    },
    setPlaybackRangeExplicit(start?: number, end?: number) {
        if (process.env.NODE_ENV !== 'production') {
            try {
                console.warn(
                    '[timelineStore] setPlaybackRangeExplicit(seconds) is deprecated; use setPlaybackRangeExplicitTicks.'
                );
            } catch {
                /* ignore */
            }
        }
        const s = get();
        const startBeats = typeof start === 'number' ? _secondsToBeatsLocal(s, start) : undefined;
        const endBeats = typeof end === 'number' ? _secondsToBeatsLocal(s, end) : undefined;
        get().setPlaybackRangeExplicitTicks(
            typeof startBeats === 'number' ? _beatsToTicks(startBeats) : undefined,
            typeof endBeats === 'number' ? _beatsToTicks(endBeats) : undefined
        );
    },

    setRowHeight(h: number) {
        const minH = 16;
        const maxH = 160;
        const v = Math.max(minH, Math.min(maxH, Math.floor(h)));
        set(() => ({ rowHeight: v }));
    },
});

export const useTimelineStore = create<TimelineState>(storeImpl);

// Temporary compatibility layer (Phase 4): inject read-only derived seconds fields expected by legacy UI
// This mutates the state object on subscribe access; components relying on seconds can continue until refactored.
useTimelineStore.subscribe((s) => {
    const anyState: any = s as any;
    // Migration: ensure all midiCache entries are normalized to CANONICAL_PPQ
    if (anyState.midiCache) {
        for (const key of Object.keys(anyState.midiCache)) {
            const entry = anyState.midiCache[key];
            if (entry && entry.ticksPerQuarter && entry.ticksPerQuarter !== CANONICAL_PPQ) {
                const scale = CANONICAL_PPQ / entry.ticksPerQuarter;
                if (process.env.NODE_ENV !== 'production') {
                    try {
                        console.warn(
                            `[timelineStore][migration] Normalizing midiCache entry ${key} from PPQ ${entry.ticksPerQuarter} to ${CANONICAL_PPQ}.`
                        );
                    } catch {}
                }
                entry.notesRaw = entry.notesRaw.map((n: any) => {
                    const startTick = Math.round(n.startTick * scale);
                    const endTick = Math.round(n.endTick * scale);
                    const durationTicks = Math.max(0, endTick - startTick);
                    const startBeat = startTick / CANONICAL_PPQ;
                    const endBeat = endTick / CANONICAL_PPQ;
                    return {
                        ...n,
                        startTick,
                        endTick,
                        durationTicks,
                        startBeat,
                        endBeat,
                        durationBeats: endBeat - startBeat,
                    };
                });
                entry.ticksPerQuarter = CANONICAL_PPQ;
            }
        }
    }
    // currentTimeSec derived
    if (anyState.timeline) {
        // If test or external code manually injected currentTimeSec without adjusting tick, infer tick from seconds once.
        if (typeof anyState.timeline.currentTick !== 'number' && typeof anyState.timeline.currentTimeSec === 'number') {
            const spbTmp = 60 / (anyState.timeline.globalBpm || 120);
            const beatsTmp = secondsToBeats(anyState.timeline.masterTempoMap, anyState.timeline.currentTimeSec, spbTmp);
            anyState.timeline.currentTick = Math.round(_beatsToTicks(beatsTmp));
            anyState.timeline.playheadAuthority = anyState.timeline.playheadAuthority || 'seconds';
        }
    }
    if (anyState.timeline && typeof anyState.timeline.currentTick === 'number') {
        const authority: string | undefined = anyState.timeline.playheadAuthority;
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const map = anyState.timeline.masterTempoMap;
        const existingSec = anyState.timeline.currentTimeSec;
        const derivedSec = beatsToSeconds(map, anyState.timeline.currentTick / _tmSingleton.ticksPerQuarter, spb);
        if (authority === 'seconds') {
            // Seconds was authoritative: ensure tick matches existingSec
            if (typeof existingSec === 'number') {
                const beats = secondsToBeats(map, existingSec, spb);
                anyState.timeline.currentTick = Math.round(_beatsToTicks(beats));
            } else {
                anyState.timeline.currentTimeSec = derivedSec;
            }
        } else {
            // Tick / clock / user authoritative: only update seconds if drifted
            if (Math.abs((existingSec ?? 0) - derivedSec) > 1e-9) {
                anyState.timeline.currentTimeSec = derivedSec;
            }
        }
    }
    // timelineView seconds
    if (anyState.timelineView && typeof anyState.timelineView.startTick === 'number') {
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const map = anyState.timeline.masterTempoMap;
        const toSec = (tick: number) => {
            const beats = tick / _tmSingleton.ticksPerQuarter;
            return beatsToSeconds(map, beats, spb);
        };
        anyState.timelineView.startSec = toSec(anyState.timelineView.startTick);
        anyState.timelineView.endSec = toSec(anyState.timelineView.endTick);
    }
    if (anyState.playbackRange) {
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const map = anyState.timeline.masterTempoMap;
        const toSec = (tick?: number) =>
            typeof tick === 'number' ? beatsToSeconds(map, tick / _tmSingleton.ticksPerQuarter, spb) : undefined;
        anyState.playbackRange.startSec = toSec(anyState.playbackRange.startTick);
        anyState.playbackRange.endSec = toSec(anyState.playbackRange.endTick);
    }
    // loop seconds
    if (anyState.transport) {
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const map = anyState.timeline.masterTempoMap;
        if (typeof anyState.transport.loopStartTick === 'number') {
            const beats = anyState.transport.loopStartTick / _tmSingleton.ticksPerQuarter;
            anyState.transport.loopStartSec = beatsToSeconds(map, beats, spb);
        }
        if (typeof anyState.transport.loopEndTick === 'number') {
            const beats = anyState.transport.loopEndTick / _tmSingleton.ticksPerQuarter;
            anyState.transport.loopEndSec = beatsToSeconds(map, beats, spb);
        }
    }
    // track offsets legacy fields
    if (anyState.tracks) {
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const map = anyState.timeline.masterTempoMap;
        for (const id in anyState.tracks) {
            const tr = anyState.tracks[id];
            if (typeof tr.offsetTicks === 'number') {
                const beats = tr.offsetTicks / _tmSingleton.ticksPerQuarter;
                tr.offsetBeats = beats;
                tr.offsetSec = beatsToSeconds(map, beats, spb);
            }
        }
    }
});

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);
