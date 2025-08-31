import create, { type StateCreator } from 'zustand';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import { buildNotesFromMIDI } from '../core/midi/midi-ingest';
import type { TempoMapEntry, NoteRaw } from './timelineTypes';

// Phase 1: Base types for the Timeline system
// Types are now in timelineTypes.ts

export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    offsetSec: number; // timeline -> track time offset
    regionStartSec?: number;
    regionEndSec?: number;
    midiSourceId?: string; // references midiCache key
};

export type TimelineState = {
    timeline: { id: string; name: string; masterTempoMap?: TempoMapEntry[]; currentTimeSec: number };
    tracks: Record<string, TimelineTrack>;
    tracksOrder: string[];
    transport: { isPlaying: boolean; loopEnabled: boolean; loopStartSec?: number; loopEndSec?: number };
    selection: { selectedTrackIds: string[] };
    midiCache: Record<
        string,
        { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    >;

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetSec?: number }) => Promise<string>;
    removeTrack: (id: string) => void;
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => void;
    setTrackOffset: (id: string, offsetSec: number) => void;
    setTrackRegion: (id: string, start?: number, end?: number) => void;
    setTrackEnabled: (id: string, enabled: boolean) => void;
    setTrackMute: (id: string, mute: boolean) => void;
    setTrackSolo: (id: string, solo: boolean) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setCurrentTimeSec: (t: number) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    scrub: (to: number) => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRange: (start?: number, end?: number) => void;
    reorderTracks: (order: string[]) => void;
    selectTracks: (ids: string[]) => void;
    ingestMidiToCache: (
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) => void;
};

// Utility to create IDs
function makeId(prefix: string = 'trk'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    timeline: { id: 'tl_1', name: 'Main Timeline', currentTimeSec: 0 },
    tracks: {},
    tracksOrder: [],
    transport: { isPlaying: false, loopEnabled: false },
    selection: { selectedTrackIds: [] },
    midiCache: {},

    async addMidiTrack(input: { name: string; file?: File; midiData?: MIDIData; offsetSec?: number }) {
        const id = makeId();
        const track: TimelineTrack = {
            id,
            name: input.name || 'MIDI Track',
            type: 'midi',
            enabled: true,
            mute: false,
            solo: false,
            offsetSec: input.offsetSec ?? 0,
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
        set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], ...patch } } }));
    },

    setTrackOffset(id: string, offsetSec: number) {
        set((s: TimelineState) => ({ tracks: { ...s.tracks, [id]: { ...s.tracks[id], offsetSec } } }));
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

    setCurrentTimeSec(t: number) {
        set((s: TimelineState) => ({ timeline: { ...s.timeline, currentTimeSec: Math.max(0, t) } }));
    },

    play() {
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: true } }));
    },
    pause() {
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: false } }));
    },
    togglePlay() {
        const playing = get().transport.isPlaying;
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: !playing } }));
    },
    scrub(to: number) {
        get().setCurrentTimeSec(to);
    },

    setLoopEnabled(enabled: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: enabled } }));
    },
    setLoopRange(start?: number, end?: number) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopStartSec: start, loopEndSec: end } }));
    },

    reorderTracks(order: string[]) {
        set(() => ({ tracksOrder: [...order] }));
    },

    selectTracks(ids: string[]) {
        set(() => ({ selection: { selectedTrackIds: [...ids] } }));
    },

    ingestMidiToCache(
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) {
        set((s: TimelineState) => ({ midiCache: { ...s.midiCache, [id]: { ...data } } }));
    },
});

export const useTimelineStore = create<TimelineState>(storeImpl);

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);
