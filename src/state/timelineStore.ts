import create, { type StateCreator } from 'zustand';
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
    };
    tracks: Record<string, TimelineTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number; // canonical loop start
        loopEndTick?: number; // canonical loop end
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
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => void;
    setTrackEnabled: (id: string, enabled: boolean) => void;
    setTrackMute: (id: string, mute: boolean) => void;
    setTrackSolo: (id: string, solo: boolean) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTick: (tick: number) => void; // Phase 2 dual-write API
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
};

// Utility to create IDs
function makeId(prefix: string = 'trk'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Compute the total content end time (in seconds) across all enabled tracks using cached MIDI data
// This mirrors the logic in scene-builder.getMaxDuration but stays store-local to avoid circular deps.
// TODO Phase 5: convert note iteration to ticks (currently notes still store seconds)
function computeContentEndTick(state: TimelineState): number {
    let max = 0;
    try {
        for (const id of state.tracksOrder) {
            const t = state.tracks[id];
            if (!t || t.type !== 'midi' || !t.enabled) continue;
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            // Fallback: derive tick via existing seconds->beats path until notes migrated
            const localEndSec = cache.notesRaw.reduce((m: number, n: any) => Math.max(m, n.endTime || 0), 0);
            const beats = _secondsToBeatsLocal(state, localEndSec);
            const ticks = _beatsToTicks(beats) + t.offsetTicks;
            if (ticks > max) max = ticks;
        }
    } catch {}
    return max;
}

// Compute earliest content start across enabled tracks
function computeContentStartTick(state: TimelineState): number {
    let min = Infinity;
    try {
        for (const id of state.tracksOrder) {
            const t = state.tracks[id];
            if (!t || t.type !== 'midi' || !t.enabled) continue;
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            const localStartSec = cache.notesRaw.reduce((m: number, n: any) => Math.min(m, n.startTime || 0), Infinity);
            const beats = _secondsToBeatsLocal(state, localStartSec);
            const ticks = _beatsToTicks(beats) + t.offsetTicks;
            if (ticks < min) min = ticks;
        }
    } catch {}
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
    const clippedEnd = Math.min(end, start + oneBarTicks * 960); // temporary cap
    set((prev: TimelineState) => ({
        playbackRange: { startTick: start, endTick: clippedEnd + oneBarTicks },
        timelineView: { startTick: Math.max(0, start - oneBarTicks), endTick: clippedEnd + oneBarTicks * 2 },
    }));
}

// Shared singleton timing manager (Phase 2): we assume constant PPQ here; later phases may make PPQ configurable.
const _tmSingleton = new TimingManager();
function _beatsToTicks(beats: number): number {
    return Math.round(beats * _tmSingleton.ticksPerQuarter);
}
function _ticksToBeats(ticks: number): number {
    return ticks / _tmSingleton.ticksPerQuarter;
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    timeline: { id: 'tl_1', name: 'Main Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
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

    async addMidiTrack(input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) {
        const id = makeId();
        const s = get();
        const initialOffsetTicks = input.offsetTicks ?? 0;
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
            const next: TimelineTrack = { ...prev, ...patch } as any;
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
            const next: TimelineTrack = { ...prev, offsetTicks } as any;
            return { tracks: { ...s.tracks, [id]: next } } as Partial<TimelineState> as TimelineState;
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

    setMasterTempoMap(map?: TempoMapEntry[]) {
        // When tempo map changes, recompute real-time seconds for beat-based notes in cache
        set((s: TimelineState) => {
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, masterTempoMap: map };
            const spbFallback = 60 / (next.timeline.globalBpm || 120);
            for (const key of Object.keys(next.midiCache)) {
                const cache = next.midiCache[key];
                if (!cache || !cache.notesRaw) continue;
                const notes = cache.notesRaw;
                for (const n of notes) {
                    if (n.startBeat !== undefined && n.endBeat !== undefined) {
                        n.startTime = beatsToSeconds(map, n.startBeat, spbFallback);
                        n.endTime = beatsToSeconds(map, n.endBeat, spbFallback);
                        n.duration = Math.max(0, n.endTime - n.startTime);
                    }
                }
            }
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
            if (!hadMap) {
                const spbFallback = 60 / v;
                for (const key of Object.keys(next.midiCache)) {
                    const cache = next.midiCache[key];
                    if (!cache || !cache.notesRaw) continue;
                    for (const n of cache.notesRaw) {
                        if (n.startBeat !== undefined && n.endBeat !== undefined) {
                            n.startTime = n.startBeat * spbFallback;
                            n.endTime = n.endBeat * spbFallback;
                            n.duration = Math.max(0, n.endTime - n.startTime);
                        }
                    }
                }
            }
            return next;
        });
    },

    setBeatsPerBar(n: number) {
        const v = Math.max(1, Math.floor(n || 4));
        set((s: TimelineState) => ({ timeline: { ...s.timeline, beatsPerBar: v } }));
    },

    setCurrentTick(tick: number) {
        set((s: TimelineState) => {
            return {
                timeline: { ...s.timeline, currentTick: Math.max(0, tick) },
            } as TimelineState;
        });
    },

    play() {
        set((s: TimelineState) => {
            let curTick = s.timeline.currentTick;
            if (s.transport.quantize === 'bar') {
                const ticksPerBar = _beatsToTicks(s.timeline.beatsPerBar);
                curTick = Math.round(curTick / ticksPerBar) * ticksPerBar;
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
            timeline: { ...s.timeline, currentTick: Math.max(0, tick) },
            transport: { ...s.transport, state: 'seeking' },
        }));
    },
    scrubTick(tick: number) {
        get().setCurrentTick(tick);
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
                },
            } as TimelineState;
        });
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

// Temporary compatibility layer (Phase 4): inject read-only derived seconds fields expected by legacy UI
// This mutates the state object on subscribe access; components relying on seconds can continue until refactored.
useTimelineStore.subscribe((s) => {
    const anyState: any = s as any;
    // currentTimeSec derived
    if (anyState.timeline && typeof anyState.timeline.currentTick === 'number') {
        const beatsVal = anyState.timeline.currentTick / _tmSingleton.ticksPerQuarter;
        const spb = 60 / (anyState.timeline.globalBpm || 120);
        const sec = beatsToSeconds(anyState.timeline.masterTempoMap, beatsVal, spb);
        anyState.timeline.currentTimeSec = sec;
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
});

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);
