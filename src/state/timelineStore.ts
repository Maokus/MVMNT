import create, { type StateCreator } from 'zustand';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import { buildNotesFromMIDI } from '../core/midi/midi-ingest';
import type { TempoMapEntry, NoteRaw } from './timelineTypes';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';

// Local helpers to avoid importing selectors (prevent circular deps)
function _secondsToBarsLocal(state: TimelineState, seconds: number): number {
    const bpb = state.timeline.beatsPerBar || 4;
    const spbFallback = 60 / (state.timeline.globalBpm || 120);
    const beats = secondsToBeats(state.timeline.masterTempoMap, seconds, spbFallback);
    return beats / bpb;
}
function _barsToSecondsLocal(state: TimelineState, bars: number): number {
    const bpb = state.timeline.beatsPerBar || 4;
    const spbFallback = 60 / (state.timeline.globalBpm || 120);
    const beats = bars * bpb;
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spbFallback);
}

// Local helpers for beats<->seconds using current timeline tempo context
function _secondsToBeatsLocal(state: TimelineState, seconds: number): number {
    const spbFallback = 60 / (state.timeline.globalBpm || 120);
    return secondsToBeats(state.timeline.masterTempoMap, seconds, spbFallback);
}
function _beatsToSecondsLocal(state: TimelineState, beats: number): number {
    const spbFallback = 60 / (state.timeline.globalBpm || 120);
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spbFallback);
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
    // Source of truth is offsetBeats; offsetSec is maintained for compatibility and rendering
    offsetSec: number; // derived from offsetBeats
    offsetBeats?: number; // beats from first beat (Phase 1)
    regionStartSec?: number;
    regionEndSec?: number;
    midiSourceId?: string; // references midiCache key
};

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTimeSec: number;
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
    };
    tracks: Record<string, TimelineTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartSec?: number;
        loopEndSec?: number;
        rate: number; // playback rate factor (inactive until wired to visualizer/worker)
        quantize: 'off' | 'bar'; // minimal Phase 2: toggle bar quantization on/off
    };
    selection: { selectedTrackIds: string[] };
    // UI view window for seekbar and navigation
    timelineView: { startSec: number; endSec: number };
    // Real playback range braces (yellow). Optional; when unset, fallback to timelineView.
    playbackRange?: { startSec?: number; endSec?: number };
    midiCache: Record<
        string,
        { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    >;
    // UI preferences
    rowHeight: number; // track row height in px

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetSec?: number }) => Promise<string>;
    removeTrack: (id: string) => void;
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => void;
    setTrackOffset: (id: string, offsetSec: number) => void;
    setTrackOffsetBeats: (id: string, offsetBeats: number) => void;
    setTrackRegion: (id: string, start?: number, end?: number) => void;
    setTrackEnabled: (id: string, enabled: boolean) => void;
    setTrackMute: (id: string, mute: boolean) => void;
    setTrackSolo: (id: string, solo: boolean) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTimeSec: (t: number) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seek: (sec: number) => void;
    scrub: (to: number) => void;
    setRate: (rate: number) => void;
    setQuantize: (q: 'off' | 'bar') => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRange: (start?: number, end?: number) => void;
    setLoop: (cfg: {
        enabled?: boolean;
        startSec?: number;
        endSec?: number;
        startBars?: number;
        endBars?: number;
    }) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => void;
    setTimelineView: (start: number, end: number) => void;
    selectTracks: (ids: string[]) => void;
    setPlaybackRange: (start?: number, end?: number) => void;
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
function computeContentEndSec(state: TimelineState): number {
    let max = 0;
    try {
        for (const id of state.tracksOrder) {
            const t = state.tracks[id];
            if (!t || t.type !== 'midi' || !t.enabled) continue;
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            const localEnd = cache.notesRaw.reduce((m: number, n: any) => Math.max(m, n.endTime || 0), 0);
            let end = localEnd;
            if (typeof t.regionEndSec === 'number') end = Math.min(end, t.regionEndSec);
            if (typeof t.regionStartSec === 'number') end = Math.max(end, t.regionStartSec);
            const offset =
                typeof (t as any).offsetBeats === 'number'
                    ? _beatsToSecondsLocal(state, (t as any).offsetBeats)
                    : t.offsetSec || 0;
            const timelineEnd = offset + end;
            if (timelineEnd > max) max = timelineEnd;
        }
    } catch {}
    return max;
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    timeline: { id: 'tl_1', name: 'Main Timeline', currentTimeSec: 0, globalBpm: 120, beatsPerBar: 4 },
    tracks: {},
    tracksOrder: [],
    transport: {
        state: 'idle',
        isPlaying: false,
        loopEnabled: false,
        rate: 1.0,
        quantize: 'off',
        loopStartSec: 2,
        loopEndSec: 5,
    },
    selection: { selectedTrackIds: [] },
    midiCache: {},
    timelineView: { startSec: 0, endSec: 60 },
    playbackRange: undefined,
    rowHeight: 30,

    async addMidiTrack(input: { name: string; file?: File; midiData?: MIDIData; offsetSec?: number }) {
        const id = makeId();
        const s = get();
        const initialOffsetSec = input.offsetSec ?? 0;
        const initialOffsetBeats = _secondsToBeatsLocal(s, initialOffsetSec);
        const track: TimelineTrack = {
            id,
            name: input.name || 'MIDI Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            offsetSec: initialOffsetSec,
            offsetBeats: initialOffsetBeats,
        };

        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: track },
            tracksOrder: [...s.tracksOrder, id],
        }));

        // If MIDI data provided, ingest immediately. File-based ingestion will be wired later in Phase 2/4 UI.
        if (input.midiData) {
            const ingested = buildNotesFromMIDI(input.midiData);
            get().ingestMidiToCache(id, ingested);
            set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], midiSourceId: id } } }));
        } else if (input.file) {
            // Lazy parse using existing midi-library
            const { parseMIDIFileToData } = await import('@core/midi/midi-library');
            const midiData = await parseMIDIFileToData(input.file);
            const ingested = buildNotesFromMIDI(midiData);
            get().ingestMidiToCache(id, ingested);
            set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], midiSourceId: id } } }));
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
    },

    updateTrack(id: string, patch: Partial<TimelineTrack>) {
        // Keep offsetSec <-> offsetBeats in sync; prefer explicit values in patch
        set((s: TimelineState) => {
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as Partial<TimelineState> as TimelineState;
            let next: TimelineTrack = { ...prev, ...patch } as TimelineTrack;
            // If offsetBeats is provided but offsetSec isn't, derive seconds
            if (typeof patch.offsetBeats === 'number' && typeof patch.offsetSec !== 'number') {
                const sec = _beatsToSecondsLocal(s, patch.offsetBeats);
                next.offsetSec = sec;
            }
            // If offsetSec is provided but offsetBeats isn't, derive beats
            if (typeof patch.offsetSec === 'number' && typeof patch.offsetBeats !== 'number') {
                const beats = _secondsToBeatsLocal(s, patch.offsetSec);
                (next as any).offsetBeats = beats;
            }
            return { tracks: { ...s.tracks, [id]: next } } as Partial<TimelineState> as TimelineState;
        });
    },

    setTrackOffset(id: string, offsetSec: number) {
        // Delegate to beats-based storage for source of truth
        const s = get();
        const beats = _secondsToBeatsLocal(s, offsetSec);
        get().setTrackOffsetBeats(id, beats);
    },

    setTrackOffsetBeats(id: string, offsetBeats: number) {
        set((s: TimelineState) => {
            const sec = _beatsToSecondsLocal(s, offsetBeats);
            const prev = s.tracks[id];
            if (!prev) return { tracks: s.tracks } as Partial<TimelineState> as TimelineState;
            const next: TimelineTrack = { ...prev, offsetBeats, offsetSec: sec };
            return { tracks: { ...s.tracks, [id]: next } } as Partial<TimelineState> as TimelineState;
        });
    },

    setTrackRegion(id: string, start?: number, end?: number) {
        set((s: TimelineState) => ({
            tracks: { ...s.tracks, [id]: { ...s.tracks[id], regionStartSec: start, regionEndSec: end } },
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
        set((s: TimelineState) => ({ timeline: { ...s.timeline, masterTempoMap: map } }));
    },

    setGlobalBpm(bpm: number) {
        const v = isFinite(bpm) && bpm > 0 ? bpm : 120;
        set((s: TimelineState) => ({ timeline: { ...s.timeline, globalBpm: v } }));
    },

    setBeatsPerBar(n: number) {
        const v = Math.max(1, Math.floor(n || 4));
        set((s: TimelineState) => ({ timeline: { ...s.timeline, beatsPerBar: v } }));
    },

    setCurrentTimeSec(t: number) {
        set((s: TimelineState) => {
            // Loop wrap behavior (Phase 4): if playing and loop is enabled and end is defined and exceeded, wrap to start
            let newT = Math.max(0, t);
            const { loopEnabled, loopStartSec, loopEndSec, isPlaying } = s.transport;
            if (isPlaying && loopEnabled && typeof loopStartSec === 'number' && typeof loopEndSec === 'number') {
                if (newT >= loopEndSec) {
                    // Quantize loop seek if configured
                    const quant = s.transport.quantize;
                    if (quant === 'bar') {
                        const snappedBars = Math.round(_secondsToBarsLocal(s, loopStartSec));
                        newT = _barsToSecondsLocal(s, snappedBars);
                    } else {
                        newT = loopStartSec;
                    }
                }
            }
            return { timeline: { ...s.timeline, currentTimeSec: newT } } as TimelineState;
        });
    },

    play() {
        set((s: TimelineState) => {
            // Quantized play (Phase 4): optionally snap current time to nearest bar before starting
            let t = s.timeline.currentTimeSec;
            if (s.transport.quantize === 'bar') {
                const snappedBars = Math.round(_secondsToBarsLocal(s, t));
                t = _barsToSecondsLocal(s, snappedBars);
            }
            return {
                timeline: { ...s.timeline, currentTimeSec: t },
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
    seek(sec: number) {
        set((s: TimelineState) => {
            const quant = s.transport.quantize;
            let t = Math.max(0, sec);
            if (quant === 'bar') {
                const snappedBars = Math.round(_secondsToBarsLocal(s, t));
                t = _barsToSecondsLocal(s, snappedBars);
            }
            return {
                timeline: { ...s.timeline, currentTimeSec: t },
                transport: { ...s.transport, state: 'seeking' },
            } as TimelineState;
        });
    },
    scrub(to: number) {
        get().setCurrentTimeSec(to);
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
    setLoopRange(start?: number, end?: number) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopStartSec: start, loopEndSec: end } }));
    },
    setLoop(cfg: { enabled?: boolean; startSec?: number; endSec?: number; startBars?: number; endBars?: number }) {
        set((s: TimelineState) => {
            const next: TimelineState['transport'] = { ...s.transport };
            if (typeof cfg.enabled === 'boolean') next.loopEnabled = cfg.enabled;
            // Convert bars to seconds if provided
            const start =
                typeof cfg.startSec === 'number'
                    ? cfg.startSec
                    : typeof cfg.startBars === 'number'
                    ? _barsToSecondsLocal(s, cfg.startBars)
                    : next.loopStartSec;
            const end =
                typeof cfg.endSec === 'number'
                    ? cfg.endSec
                    : typeof cfg.endBars === 'number'
                    ? _barsToSecondsLocal(s, cfg.endBars)
                    : next.loopEndSec;
            next.loopStartSec = start;
            next.loopEndSec = end;
            return { transport: next } as TimelineState;
        });
    },
    toggleLoop() {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } }));
    },

    reorderTracks(order: string[]) {
        set(() => ({ tracksOrder: [...order] }));
    },

    setTimelineView(start: number, end: number) {
        // Allow a small negative pre-roll, and clamp range min/max width.
        const MIN_RANGE = 0.05; // 50ms min
        const MAX_RANGE = 60 * 60 * 24; // 24h max
        let sRaw = Math.min(start, end);
        let eRaw = Math.max(start, end);
        // Allow pre-roll negative up to -10s
        const PRE_ROLL = -10;
        let s = Math.max(PRE_ROLL, sRaw);
        let e = Math.max(s + MIN_RANGE, eRaw);
        if (e - s > MAX_RANGE) e = s + MAX_RANGE;
        set(() => ({ timelineView: { startSec: s, endSec: e } }));
    },

    selectTracks(ids: string[]) {
        set(() => ({ selection: { selectedTrackIds: [...ids] } }));
    },

    ingestMidiToCache(
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) {
        // Update cache only. Do NOT auto-adjust the timeline view here to respect manual start/end settings.
        set((s: TimelineState) => ({ midiCache: { ...s.midiCache, [id]: { ...data } } }));
    },

    setPlaybackRange(start?: number, end?: number) {
        set((s: TimelineState) => ({
            playbackRange: {
                startSec: typeof start === 'number' ? Math.max(0, start) : undefined,
                endSec: typeof end === 'number' ? Math.max(0.0001, end) : undefined,
            },
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
