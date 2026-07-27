import type { AudioTrack, AudioCacheEntry, AudioClip } from '@audio/audioTypes';
import type { AudioFeatureCache, AudioFeatureCacheStatus } from '@audio/features/audioFeatureTypes';
import type { MIDIData } from '@core/types';
import type { TimelineState, TimelineTrack } from '../timelineStore';
import type { NoteRaw, CCEventRaw, TempoMapEntry } from '../timelineTypes';
import { autoAdjustSceneRangeIfNeeded } from './timelineShared';
import { useSelectionStore } from '@state/selectionStore';
import type { MidiClip } from './midiClips';

export type TimelineTrackLike = TimelineTrack | AudioTrack;

export interface TimelineMidiCacheEntry {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ccRaw: CCEventRaw[];
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
}

export interface TimelinePatchAddTrackPayload {
    track: TimelineTrackLike;
    index?: number;
    midiCache?: { key: string; value: TimelineMidiCacheEntry };
    audioCache?: { key: string; value: AudioCacheEntry };
    audioFeatureCache?: { key: string; value: AudioFeatureCache };
    selection?: string[];
}

export interface TimelinePatchRemoveTracksPayload {
    trackIds: string[];
    midiCacheKeys?: string[];
    audioCacheKeys?: string[];
    audioFeatureCacheKeys?: string[];
    selection?: string[];
}

export interface TimelinePatchRestoreTracksPayload {
    tracks: Array<{
        track: TimelineTrackLike;
        index: number;
        midiCache?: { key: string; value: TimelineMidiCacheEntry };
        audioCache?: { key: string; value: AudioCacheEntry };
        audioFeatureCache?: { key: string; value: AudioFeatureCache };
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

export interface TimelinePatchAddMidiClipPayload {
    trackId: string;
    clip: MidiClip;
}

export interface TimelinePatchRemoveMidiClipsPayload {
    clips: Array<{ trackId: string; clipId: string }>;
    midiCacheKeys?: string[];
}

export interface TimelinePatchRestoreMidiClipsPayload {
    clips: Array<{ trackId: string; clip: MidiClip; index?: number }>;
    midiCache?: Array<{ key: string; value: TimelineMidiCacheEntry }>;
}

export interface TimelinePatchUpdateMidiClipsPayload {
    updates: Array<{ trackId: string; clips: MidiClip[] }>;
}

export interface TimelinePatchRemoveAudioClipsPayload {
    clips: Array<{ trackId: string; clipId: string }>;
    audioCacheKeys?: string[];
    audioFeatureCacheKeys?: string[];
}

export interface TimelinePatchRestoreAudioClipsPayload {
    clips: Array<{ trackId: string; clip: AudioClip; index?: number }>;
    audioCache?: Array<{ key: string; value: AudioCacheEntry }>;
    audioFeatureCaches?: Array<{ key: string; value: AudioFeatureCache }>;
}

export interface TimelinePatchUpdateAudioClipsPayload {
    updates: Array<{ trackId: string; clips: AudioClip[] }>;
}

export type TimelinePatchAction =
    | { action: 'timeline/ADD_TRACK'; payload: TimelinePatchAddTrackPayload }
    | { action: 'timeline/REMOVE_TRACKS'; payload: TimelinePatchRemoveTracksPayload }
    | { action: 'timeline/RESTORE_TRACKS'; payload: TimelinePatchRestoreTracksPayload }
    | { action: 'timeline/SET_TRACK_OFFSET_TICKS'; payload: TimelinePatchSetTrackOffsetPayload }
    | { action: 'timeline/UPDATE_TRACKS'; payload: TimelinePatchUpdateTracksPayload }
    | { action: 'timeline/SET_TRACK_ORDER'; payload: TimelinePatchSetTrackOrderPayload }
    | { action: 'timeline/ADD_MIDI_CLIP'; payload: TimelinePatchAddMidiClipPayload }
    | { action: 'timeline/REMOVE_MIDI_CLIPS'; payload: TimelinePatchRemoveMidiClipsPayload }
    | { action: 'timeline/RESTORE_MIDI_CLIPS'; payload: TimelinePatchRestoreMidiClipsPayload }
    | { action: 'timeline/UPDATE_MIDI_CLIPS'; payload: TimelinePatchUpdateMidiClipsPayload }
    | { action: 'timeline/REMOVE_AUDIO_CLIPS'; payload: TimelinePatchRemoveAudioClipsPayload }
    | { action: 'timeline/RESTORE_AUDIO_CLIPS'; payload: TimelinePatchRestoreAudioClipsPayload }
    | { action: 'timeline/UPDATE_AUDIO_CLIPS'; payload: TimelinePatchUpdateAudioClipsPayload };

export interface TimelineCommandPatch {
    undo: TimelinePatchAction[];
    redo: TimelinePatchAction[];
}

export interface TimelinePatchContext {
    getState: () => TimelineState;
    setState: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;
}

function buildReadyFeatureStatus(cache: AudioFeatureCache): AudioFeatureCacheStatus {
    return {
        state: 'ready',
        updatedAt: Date.now(),
        sourceHash: JSON.stringify({
            hopTicks: cache.hopTicks,
            frameCount: cache.frameCount,
            analysisParams: cache.analysisParams,
        }),
    };
}

function resolveSelectionIds(payloadSelection: string[] | undefined): string[] {
    if (Array.isArray(payloadSelection)) return payloadSelection;
    return useSelectionStore.getState().selectedTrackIds;
}

function insertTrackAtIndex(
    state: TimelineState,
    track: TimelineTrackLike,
    index: number | undefined
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

function removeTracks(
    state: TimelineState,
    trackIds: string[]
): {
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
        midiCache: payload.midiCache
            ? { ...state.midiCache, [payload.midiCache.key]: payload.midiCache.value }
            : state.midiCache,
        audioCache: payload.audioCache
            ? { ...state.audioCache, [payload.audioCache.key]: payload.audioCache.value }
            : state.audioCache,
        audioFeatureCaches: payload.audioFeatureCache
            ? { ...state.audioFeatureCaches, [payload.audioFeatureCache.key]: payload.audioFeatureCache.value }
            : state.audioFeatureCaches,
        audioFeatureCacheStatus: payload.audioFeatureCache
            ? {
                  ...state.audioFeatureCacheStatus,
                  [payload.audioFeatureCache.key]: buildReadyFeatureStatus(payload.audioFeatureCache.value),
              }
            : state.audioFeatureCacheStatus,
    }));
    useSelectionStore.getState().selectTracks(resolveSelectionIds(payload.selection));
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
        const nextAudioFeatureCaches = { ...state.audioFeatureCaches };
        const nextAudioFeatureStatus = { ...state.audioFeatureCacheStatus };
        for (const key of payload.audioFeatureCacheKeys ?? []) {
            delete nextAudioFeatureCaches[key];
            delete nextAudioFeatureStatus[key];
        }
        return {
            tracks,
            tracksOrder,
            midiCache: nextMidiCache,
            audioCache: nextAudioCache,
            audioFeatureCaches: nextAudioFeatureCaches,
            audioFeatureCacheStatus: nextAudioFeatureStatus,
        };
    });
    const removedSet = new Set(payload.trackIds);
    const nextSelection = resolveSelectionIds(payload.selection).filter((id) => !removedSet.has(id));
    useSelectionStore.getState().setSelectedTrackIds(nextSelection);
    if (!nextSelection.length && useSelectionStore.getState().activeTarget === 'tracks') {
        useSelectionStore.getState().setActiveTarget('none');
    }
}

function applyRestoreTracks(context: TimelinePatchContext, payload: TimelinePatchRestoreTracksPayload): void {
    const { getState, setState } = context;
    const snapshot = getState();
    let nextTracks = { ...snapshot.tracks } as TimelineState['tracks'];
    let nextOrder = [...snapshot.tracksOrder];
    const nextMidiCache = { ...snapshot.midiCache };
    const nextAudioCache = { ...snapshot.audioCache };
    const nextAudioFeatureCaches = { ...snapshot.audioFeatureCaches };
    const nextAudioFeatureStatus = { ...snapshot.audioFeatureCacheStatus } as Record<string, AudioFeatureCacheStatus>;
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
        if (entry.audioFeatureCache) {
            nextAudioFeatureCaches[entry.audioFeatureCache.key] = entry.audioFeatureCache.value;
            nextAudioFeatureStatus[entry.audioFeatureCache.key] = buildReadyFeatureStatus(
                entry.audioFeatureCache.value
            );
        }
    }
    setState((_state) => ({
        tracks: nextTracks,
        tracksOrder: nextOrder,
        midiCache: nextMidiCache,
        audioCache: nextAudioCache,
        audioFeatureCaches: nextAudioFeatureCaches,
        audioFeatureCacheStatus: nextAudioFeatureStatus,
    }));
    useSelectionStore.getState().selectTracks(resolveSelectionIds(payload.selection));
}

function applySetTrackOffset(context: TimelinePatchContext, payload: TimelinePatchSetTrackOffsetPayload): void {
    const { getState, setState } = context;
    setState((state) => {
        const track = state.tracks[payload.trackId];
        if (!track) return state;
        const previousOffset = track.type === 'audio' ? (track.clips[0]?.offsetTicks ?? 0) : (track.offsetTicks ?? 0);
        const nextTrack: any = track.type === 'audio' ? { ...track } : { ...track, offsetTicks: payload.offsetTicks };
        if ((nextTrack.type === 'midi' || nextTrack.type === 'audio') && Array.isArray(nextTrack.clips)) {
            if (nextTrack.clips.length === 1) {
                nextTrack.clips = [{ ...nextTrack.clips[0], offsetTicks: payload.offsetTicks }];
            } else if (nextTrack.clips.length > 1) {
                const delta = payload.offsetTicks - previousOffset;
                nextTrack.clips = nextTrack.clips.map((clip: MidiClip) => ({
                    ...clip,
                    offsetTicks: Math.max(0, clip.offsetTicks + delta),
                }));
            }
        }
        const next: Partial<TimelineState> = {
            tracks: {
                ...state.tracks,
                [payload.trackId]: nextTrack,
            },
        } as any;
        return next as TimelineState;
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
            const nextTrack = { ...existing, ...update.patch } as TimelineTrackLike;
            if (
                (nextTrack.type === 'midi' || nextTrack.type === 'audio') &&
                Array.isArray(nextTrack.clips) &&
                nextTrack.clips.length === 1 &&
                ('regionStartTick' in update.patch || 'regionEndTick' in update.patch)
            ) {
                (nextTrack as any).clips = [
                    {
                        ...nextTrack.clips[0],
                        ...('regionStartTick' in update.patch
                            ? { regionStartTick: (update.patch as any).regionStartTick }
                            : {}),
                        ...('regionEndTick' in update.patch
                            ? { regionEndTick: (update.patch as any).regionEndTick }
                            : {}),
                    },
                ];
            }
            nextTracks[update.trackId] = nextTrack;
        }
        if (!mutated) return state;
        return { tracks: nextTracks } as TimelineState;
    });
}

function applySetTrackOrder(context: TimelinePatchContext, payload: TimelinePatchSetTrackOrderPayload): void {
    const { setState } = context;
    setState(() => ({ tracksOrder: [...payload.order] }) as TimelineState);
}

function applyAddMidiClip(context: TimelinePatchContext, payload: TimelinePatchAddMidiClipPayload): void {
    context.setState((state) => {
        const track = state.tracks[payload.trackId];
        if (!track || track.type !== 'midi') return state;
        const clips = Array.isArray(track.clips) ? track.clips : [];
        return {
            tracks: {
                ...state.tracks,
                [payload.trackId]: { ...track, clips: [...clips, payload.clip] },
            },
        } as TimelineState;
    });
}

function applyRemoveMidiClips(context: TimelinePatchContext, payload: TimelinePatchRemoveMidiClipsPayload): void {
    const targetsByTrack = new Map<string, Set<string>>();
    for (const target of payload.clips) {
        if (!targetsByTrack.has(target.trackId)) targetsByTrack.set(target.trackId, new Set());
        targetsByTrack.get(target.trackId)?.add(target.clipId);
    }
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const [trackId, clipIds] of targetsByTrack) {
            const track = state.tracks[trackId];
            if (!track || track.type !== 'midi' || !Array.isArray(track.clips)) continue;
            const clips = track.clips.filter((clip) => !clipIds.has(clip.id));
            if (clips.length === track.clips.length) continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[trackId] = { ...track, clips };
        }
        const nextMidiCache = { ...state.midiCache };
        for (const key of payload.midiCacheKeys ?? []) {
            delete nextMidiCache[key];
        }
        if (!mutated && !payload.midiCacheKeys?.length) return state;
        return { tracks: nextTracks, midiCache: nextMidiCache } as TimelineState;
    });
}

function applyRestoreMidiClips(context: TimelinePatchContext, payload: TimelinePatchRestoreMidiClipsPayload): void {
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const entry of payload.clips) {
            const track = state.tracks[entry.trackId];
            if (!track || track.type !== 'midi') continue;
            const clips = Array.isArray(track.clips) ? [...track.clips] : [];
            if (clips.some((clip) => clip.id === entry.clip.id)) continue;
            const index =
                typeof entry.index === 'number' ? Math.max(0, Math.min(entry.index, clips.length)) : clips.length;
            clips.splice(index, 0, entry.clip);
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[entry.trackId] = { ...track, clips };
        }
        const nextMidiCache = { ...state.midiCache };
        for (const cache of payload.midiCache ?? []) {
            nextMidiCache[cache.key] = cache.value;
        }
        if (!mutated && !payload.midiCache?.length) return state;
        return { tracks: nextTracks, midiCache: nextMidiCache } as TimelineState;
    });
}

function applyUpdateMidiClips(context: TimelinePatchContext, payload: TimelinePatchUpdateMidiClipsPayload): void {
    if (!payload.updates.length) return;
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const update of payload.updates) {
            const track = state.tracks[update.trackId];
            if (!track || track.type !== 'midi') continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[update.trackId] = { ...track, clips: update.clips };
        }
        if (!mutated) return state;
        return { tracks: nextTracks } as TimelineState;
    });
}

function applyRemoveAudioClips(context: TimelinePatchContext, payload: TimelinePatchRemoveAudioClipsPayload): void {
    const targetsByTrack = new Map<string, Set<string>>();
    for (const target of payload.clips) {
        if (!targetsByTrack.has(target.trackId)) targetsByTrack.set(target.trackId, new Set());
        targetsByTrack.get(target.trackId)?.add(target.clipId);
    }
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const [trackId, clipIds] of targetsByTrack) {
            const track = state.tracks[trackId];
            if (!track || track.type !== 'audio' || !Array.isArray(track.clips)) continue;
            const clips = track.clips.filter((clip) => !clipIds.has(clip.id));
            if (clips.length === track.clips.length) continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[trackId] = { ...track, clips };
        }
        const nextAudioCache = { ...state.audioCache };
        for (const key of payload.audioCacheKeys ?? []) {
            delete nextAudioCache[key];
        }
        const nextAudioFeatureCaches = { ...state.audioFeatureCaches };
        const nextAudioFeatureStatus = { ...state.audioFeatureCacheStatus };
        for (const key of payload.audioFeatureCacheKeys ?? []) {
            delete nextAudioFeatureCaches[key];
            delete nextAudioFeatureStatus[key];
        }
        if (!mutated && !payload.audioCacheKeys?.length && !payload.audioFeatureCacheKeys?.length) return state;
        return {
            tracks: nextTracks,
            audioCache: nextAudioCache,
            audioFeatureCaches: nextAudioFeatureCaches,
            audioFeatureCacheStatus: nextAudioFeatureStatus,
        } as TimelineState;
    });
}

function applyRestoreAudioClips(context: TimelinePatchContext, payload: TimelinePatchRestoreAudioClipsPayload): void {
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const entry of payload.clips) {
            const track = state.tracks[entry.trackId];
            if (!track || track.type !== 'audio') continue;
            const clips = Array.isArray(track.clips) ? [...track.clips] : [];
            if (clips.some((clip) => clip.id === entry.clip.id)) continue;
            const index =
                typeof entry.index === 'number' ? Math.max(0, Math.min(entry.index, clips.length)) : clips.length;
            clips.splice(index, 0, entry.clip);
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[entry.trackId] = { ...track, clips };
        }
        const nextAudioCache = { ...state.audioCache };
        for (const cache of payload.audioCache ?? []) {
            nextAudioCache[cache.key] = cache.value;
        }
        const nextAudioFeatureCaches = { ...state.audioFeatureCaches };
        const nextAudioFeatureStatus = { ...state.audioFeatureCacheStatus };
        for (const cache of payload.audioFeatureCaches ?? []) {
            nextAudioFeatureCaches[cache.key] = cache.value;
            nextAudioFeatureStatus[cache.key] = buildReadyFeatureStatus(cache.value);
        }
        if (!mutated && !payload.audioCache?.length && !payload.audioFeatureCaches?.length) return state;
        return {
            tracks: nextTracks,
            audioCache: nextAudioCache,
            audioFeatureCaches: nextAudioFeatureCaches,
            audioFeatureCacheStatus: nextAudioFeatureStatus,
        } as TimelineState;
    });
}

function applyUpdateAudioClips(context: TimelinePatchContext, payload: TimelinePatchUpdateAudioClipsPayload): void {
    if (!payload.updates.length) return;
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const update of payload.updates) {
            const track = state.tracks[update.trackId];
            if (!track || track.type !== 'audio') continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[update.trackId] = { ...track, clips: update.clips };
        }
        if (!mutated) return state;
        return { tracks: nextTracks } as TimelineState;
    });
}

export function applyTimelinePatchActions(context: TimelinePatchContext, actions: TimelinePatchAction[]): void {
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
            case 'timeline/ADD_MIDI_CLIP':
                applyAddMidiClip(context, action.payload);
                break;
            case 'timeline/REMOVE_MIDI_CLIPS':
                applyRemoveMidiClips(context, action.payload);
                break;
            case 'timeline/RESTORE_MIDI_CLIPS':
                applyRestoreMidiClips(context, action.payload);
                break;
            case 'timeline/UPDATE_MIDI_CLIPS':
                applyUpdateMidiClips(context, action.payload);
                break;
            case 'timeline/REMOVE_AUDIO_CLIPS':
                applyRemoveAudioClips(context, action.payload);
                break;
            case 'timeline/RESTORE_AUDIO_CLIPS':
                applyRestoreAudioClips(context, action.payload);
                break;
            case 'timeline/UPDATE_AUDIO_CLIPS':
                applyUpdateAudioClips(context, action.payload);
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
