import type { AudioTrack, AudioCacheEntry } from '@audio/audioTypes';
import type { MIDIData } from '@core/types';
import type { TimelineState, TimelineTrack } from '../timelineStore';
import type { NoteRaw, TempoMapEntry } from '../timelineTypes';
import { autoAdjustSceneRangeIfNeeded } from './timelineShared';

export type TimelineTrackLike = TimelineTrack | AudioTrack;

export interface TimelineMidiCacheEntry {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
}

export interface TimelinePatchAddTrackPayload {
    track: TimelineTrackLike;
    index?: number;
    midiCache?: { key: string; value: TimelineMidiCacheEntry };
    audioCache?: { key: string; value: AudioCacheEntry };
    selection?: string[];
}

export interface TimelinePatchRemoveTracksPayload {
    trackIds: string[];
    midiCacheKeys?: string[];
    audioCacheKeys?: string[];
    selection?: string[];
}

export interface TimelinePatchRestoreTracksPayload {
    tracks: Array<{
        track: TimelineTrackLike;
        index: number;
        midiCache?: { key: string; value: TimelineMidiCacheEntry };
        audioCache?: { key: string; value: AudioCacheEntry };
    }>;
    selection?: string[];
}

export interface TimelinePatchSetTrackOffsetPayload {
    trackId: string;
    offsetTicks: number;
}

export interface TimelinePatchUpdateTracksPayload {
    updates: Array<{
        trackId: string;
        patch: Partial<TimelineTrackLike>;
    }>;
}

export interface TimelinePatchSetTrackOrderPayload {
    order: string[];
}

export type TimelinePatchAction =
    | { action: 'timeline/ADD_TRACK'; payload: TimelinePatchAddTrackPayload }
    | { action: 'timeline/REMOVE_TRACKS'; payload: TimelinePatchRemoveTracksPayload }
    | { action: 'timeline/RESTORE_TRACKS'; payload: TimelinePatchRestoreTracksPayload }
    | { action: 'timeline/SET_TRACK_OFFSET_TICKS'; payload: TimelinePatchSetTrackOffsetPayload }
    | { action: 'timeline/UPDATE_TRACKS'; payload: TimelinePatchUpdateTracksPayload }
    | { action: 'timeline/SET_TRACK_ORDER'; payload: TimelinePatchSetTrackOrderPayload };

export interface TimelineCommandPatch {
    undo: TimelinePatchAction[];
    redo: TimelinePatchAction[];
}

export interface TimelinePatchContext {
    getState: () => TimelineState;
    setState: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;
}

function ensureSelection(selection: string[] | undefined, state: TimelineState): string[] {
    if (Array.isArray(selection)) {
        return selection;
    }
    return state.selection.selectedTrackIds;
}

function insertTrackAtIndex(
    state: TimelineState,
    track: TimelineTrackLike,
    index: number | undefined,
): { tracks: TimelineState['tracks']; tracksOrder: string[] } {
    const nextTracks = { ...state.tracks, [track.id]: track };
    const nextOrder = [...state.tracksOrder];
    if (typeof index === 'number' && index >= 0 && index <= nextOrder.length) {
        nextOrder.splice(index, 0, track.id);
    } else if (!nextOrder.includes(track.id)) {
        nextOrder.push(track.id);
    }
    return { tracks: nextTracks, tracksOrder: nextOrder };
}

function removeTracks(state: TimelineState, trackIds: string[]): {
    tracks: TimelineState['tracks'];
    tracksOrder: string[];
} {
    if (!trackIds.length) {
        return { tracks: state.tracks, tracksOrder: state.tracksOrder };
    }
    const idSet = new Set(trackIds);
    const nextTracks: typeof state.tracks = {};
    for (const [id, track] of Object.entries(state.tracks)) {
        if (!idSet.has(id)) {
            nextTracks[id] = track;
        }
    }
    const nextOrder = state.tracksOrder.filter((id) => !idSet.has(id));
    return { tracks: nextTracks, tracksOrder: nextOrder };
}

function applyAddTrack(context: TimelinePatchContext, payload: TimelinePatchAddTrackPayload): void {
    const { getState, setState } = context;
    const snapshot = getState();
    const { tracks, tracksOrder } = insertTrackAtIndex(snapshot, payload.track, payload.index);
    setState((state) => ({
        tracks,
        tracksOrder,
        selection: { selectedTrackIds: ensureSelection(payload.selection, state) },
        midiCache: payload.midiCache
            ? { ...state.midiCache, [payload.midiCache.key]: payload.midiCache.value }
            : state.midiCache,
        audioCache: payload.audioCache
            ? { ...state.audioCache, [payload.audioCache.key]: payload.audioCache.value }
            : state.audioCache,
    }));
}

function applyRemoveTracks(context: TimelinePatchContext, payload: TimelinePatchRemoveTracksPayload): void {
    const { getState, setState } = context;
    const snapshot = getState();
    const { tracks, tracksOrder } = removeTracks(snapshot, payload.trackIds);
    setState((state) => {
        const nextMidiCache = { ...state.midiCache };
        for (const key of payload.midiCacheKeys ?? []) {
            delete nextMidiCache[key];
        }
        const nextAudioCache = { ...state.audioCache };
        for (const key of payload.audioCacheKeys ?? []) {
            delete nextAudioCache[key];
        }
        const selection = ensureSelection(payload.selection, state).filter((id) => !payload.trackIds.includes(id));
        return {
            tracks,
            tracksOrder,
            midiCache: nextMidiCache,
            audioCache: nextAudioCache,
            selection: { selectedTrackIds: selection },
        };
    });
}

function applyRestoreTracks(context: TimelinePatchContext, payload: TimelinePatchRestoreTracksPayload): void {
    const { getState, setState } = context;
    const snapshot = getState();
    let nextTracks = { ...snapshot.tracks } as TimelineState['tracks'];
    let nextOrder = [...snapshot.tracksOrder];
    const nextMidiCache = { ...snapshot.midiCache };
    const nextAudioCache = { ...snapshot.audioCache };
    for (const entry of payload.tracks) {
        nextTracks = { ...nextTracks, [entry.track.id]: entry.track };
        if (!nextOrder.includes(entry.track.id)) {
            if (typeof entry.index === 'number' && entry.index >= 0 && entry.index <= nextOrder.length) {
                nextOrder.splice(entry.index, 0, entry.track.id);
            } else {
                nextOrder.push(entry.track.id);
            }
        }
        if (entry.midiCache) {
            nextMidiCache[entry.midiCache.key] = entry.midiCache.value;
        }
        if (entry.audioCache) {
            nextAudioCache[entry.audioCache.key] = entry.audioCache.value;
        }
    }
    setState((state) => ({
        tracks: nextTracks,
        tracksOrder: nextOrder,
        midiCache: nextMidiCache,
        audioCache: nextAudioCache,
        selection: { selectedTrackIds: ensureSelection(payload.selection, state) },
    }));
}

function applySetTrackOffset(
    context: TimelinePatchContext,
    payload: TimelinePatchSetTrackOffsetPayload,
): void {
    const { setState } = context;
    setState((state) => {
        const track = state.tracks[payload.trackId];
        if (!track) return state;
        return {
            tracks: {
                ...state.tracks,
                [payload.trackId]: { ...track, offsetTicks: payload.offsetTicks },
            },
        } as TimelineState;
    });
}

function applyUpdateTracks(context: TimelinePatchContext, payload: TimelinePatchUpdateTracksPayload): void {
    const { setState } = context;
    if (!payload.updates.length) return;
    setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const update of payload.updates) {
            const existing = nextTracks[update.trackId] ?? state.tracks[update.trackId];
            if (!existing) continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[update.trackId] = { ...existing, ...update.patch } as TimelineTrackLike;
        }
        if (!mutated) return state;
        return { tracks: nextTracks } as TimelineState;
    });
}

function applySetTrackOrder(context: TimelinePatchContext, payload: TimelinePatchSetTrackOrderPayload): void {
    const { setState } = context;
    setState(() => ({ tracksOrder: [...payload.order] } as TimelineState));
}

export function applyTimelinePatchActions(
    context: TimelinePatchContext,
    actions: TimelinePatchAction[],
): void {
    if (!actions.length) return;
    for (const action of actions) {
        switch (action.action) {
            case 'timeline/ADD_TRACK':
                applyAddTrack(context, action.payload);
                break;
            case 'timeline/REMOVE_TRACKS':
                applyRemoveTracks(context, action.payload);
                break;
            case 'timeline/RESTORE_TRACKS':
                applyRestoreTracks(context, action.payload);
                break;
            case 'timeline/SET_TRACK_OFFSET_TICKS':
                applySetTrackOffset(context, action.payload);
                break;
            case 'timeline/UPDATE_TRACKS':
                applyUpdateTracks(context, action.payload);
                break;
            case 'timeline/SET_TRACK_ORDER':
                applySetTrackOrder(context, action.payload);
                break;
            default:
                break;
        }
    }
    try {
        autoAdjustSceneRangeIfNeeded(context.getState, (updater) => context.setState(updater));
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[timeline][patch] auto adjust failed', error);
        }
    }
}
