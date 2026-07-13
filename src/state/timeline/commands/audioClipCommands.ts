import type { AudioCacheEntry, AudioClip, AudioTrack } from '@audio/audioTypes';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { estimateFeatureCacheBytes } from '@audio/audioMemoryDiagnostics';
import type { TimelineCommand, TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    applyTimelinePatchActions,
    type TimelineCommandPatch,
    type TimelinePatchAction,
    type TimelinePatchAddTrackPayload,
    type TimelinePatchRestoreAudioClipsPayload,
} from '../patches';
import {
    buildLightweightAudioCacheEntry,
    enforceNonOverlappingAudioClips,
    findReferencedAudioSourceIds,
    getAudioClipTimelineBounds,
    makeAudioClipId,
    resolveAudioClipOverlapWithCache,
} from '../audioClips';
import { createTimelineTimingContext } from '../timelineShared';

const LARGE_UNDO_FEATURE_CACHE_BYTES = 32 * 1024 * 1024;

export interface AddAudioClipPayload {
    trackId: string;
    clip: Omit<AudioClip, 'id' | 'type'> & { id?: string; type?: 'audio' };
}

export interface AddAudioClipResult {
    clipId: string;
}

export interface RemoveAudioClipsPayload {
    clips: Array<{ trackId: string; clipId: string }>;
}

export interface UpdateAudioClipsPayload {
    updates: Array<{ trackId: string; clipId: string; patch: Partial<Omit<AudioClip, 'id' | 'type'>> }>;
}

export interface SetMultipleAudioClipOffsetsPayload {
    offsets: Array<{ trackId: string; clipId: string; offsetTicks: number }>;
}

export interface PasteAudioClipsPayload {
    createTracks?: Array<{ trackId: string; name: string; index?: number }>;
    audioCache?: Array<{ key: string; value: AudioCacheEntry }>;
    audioFeatureCaches?: Array<{ key: string; value: AudioFeatureCache }>;
    clips: Array<{
        trackId: string;
        clip: Omit<AudioClip, 'type'> & { type?: 'audio' };
    }>;
}

export interface PasteAudioClipsResult {
    clipIds: string[];
    trackIds: string[];
}

export interface MoveAudioClipsBetweenTracksPayload {
    moves: Array<{
        sourceTrackId: string;
        clipId: string;
        destinationTrackId: string;
        newOffsetTicks: number;
    }>;
}

export interface MoveAudioClipsBetweenTracksResult {
    movedClipIds: string[];
}

function getAudioTrack(context: TimelineCommandContext, trackId: string): AudioTrack | null {
    const track = context.getState().tracks[trackId];
    return track && track.type === 'audio' ? track : null;
}

function normalizeStoredClips(track: AudioTrack, context: TimelineCommandContext): AudioClip[] {
    const state = context.getState();
    return enforceNonOverlappingAudioClips(track, state.audioCache, createTimelineTimingContext(state));
}

function applyPatch(context: TimelineCommandContext, patch: TimelineCommandPatch): void {
    applyTimelinePatchActions({ getState: context.getState, setState: context.setState }, patch.redo);
}

function sanitizeOffsetTicks(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function sanitizeRegionTick(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function sanitizeSourceSeconds(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function sanitizeGain(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return Math.max(0, Math.min(2, num));
}

function buildClip(input: AddAudioClipPayload['clip']): AudioClip {
    return {
        id: input.id || makeAudioClipId(),
        type: 'audio',
        sourceId: input.sourceId,
        offsetTicks: sanitizeOffsetTicks(input.offsetTicks),
        sourceStartSeconds: sanitizeSourceSeconds(input.sourceStartSeconds),
        sourceEndSeconds: sanitizeSourceSeconds(input.sourceEndSeconds),
        regionStartTick: sanitizeRegionTick(input.regionStartTick),
        regionEndTick: sanitizeRegionTick(input.regionEndTick),
        name: input.name,
        enabled: input.enabled,
        gain: sanitizeGain(input.gain),
    };
}

function updatePatch(trackId: string, before: AudioClip[], after: AudioClip[]): TimelineCommandPatch {
    return {
        redo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: [{ trackId, clips: after }] } }],
        undo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: [{ trackId, clips: before }] } }],
    };
}

export function createAddAudioClipCommand(
    payload: AddAudioClipPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<AddAudioClipResult> {
    return {
        id: 'timeline.addAudioClip',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.addAudioClip',
                undoLabel: 'Add Audio Clip',
                telemetryEvent: 'timeline_add_audio_clip',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<AddAudioClipResult>> {
            const track = getAudioTrack(context, payload.trackId);
            if (!track) throw new Error(`Audio track not found: ${payload.trackId}`);
            const clip = buildClip(payload.clip);
            if (!context.getState().audioCache[clip.sourceId]) {
                throw new Error(`Audio source not found: ${clip.sourceId}`);
            }
            const before = normalizeStoredClips(track, context);
            const state = context.getState();
            const after = resolveAudioClipOverlapWithCache(
                { ...track, clips: before }, clip, state.audioCache, createTimelineTimingContext(state)
            );
            const patch = updatePatch(payload.trackId, before, after);
            applyPatch(context, patch);
            return { patches: patch, result: { clipId: clip.id } };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}

export function createUpdateAudioClipsCommand(
    payload: UpdateAudioClipsPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.updateAudioClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.updateAudioClips',
                undoLabel: 'Update Audio Clips',
                telemetryEvent: 'timeline_update_audio_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<void>> {
            const updatesByTrack = new Map<string, UpdateAudioClipsPayload['updates']>();
            for (const update of payload.updates ?? []) {
                if (!updatesByTrack.has(update.trackId)) updatesByTrack.set(update.trackId, []);
                updatesByTrack.get(update.trackId)?.push(update);
            }
            const redoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            const undoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            for (const [trackId, updates] of updatesByTrack) {
                const track = getAudioTrack(context, trackId);
                if (!track) continue;
                const before = normalizeStoredClips(track, context);
                const editedById = new Map<string, AudioClip>();
                for (const update of updates) {
                    const existing = editedById.get(update.clipId) ?? before.find((clip) => clip.id === update.clipId);
                    if (!existing) continue;
                    const edited: AudioClip = {
                        ...existing,
                        ...update.patch,
                        id: existing.id,
                        type: 'audio',
                        offsetTicks:
                            update.patch.offsetTicks !== undefined
                                ? sanitizeOffsetTicks(update.patch.offsetTicks)
                                : existing.offsetTicks,
                        regionStartTick:
                            'regionStartTick' in update.patch
                                ? sanitizeRegionTick(update.patch.regionStartTick)
                                : existing.regionStartTick,
                        regionEndTick:
                            'regionEndTick' in update.patch
                                ? sanitizeRegionTick(update.patch.regionEndTick)
                                : existing.regionEndTick,
                        sourceStartSeconds:
                            'sourceStartSeconds' in update.patch
                                ? sanitizeSourceSeconds(update.patch.sourceStartSeconds)
                                : existing.sourceStartSeconds,
                        sourceEndSeconds:
                            'sourceEndSeconds' in update.patch
                                ? sanitizeSourceSeconds(update.patch.sourceEndSeconds)
                                : existing.sourceEndSeconds,
                        gain: 'gain' in update.patch ? sanitizeGain(update.patch.gain) : existing.gain,
                    };
                    if (!context.getState().audioCache[edited.sourceId]) continue;
                    editedById.set(update.clipId, edited);
                }
                let next = before.filter((clip) => !editedById.has(clip.id));
                const editedClips = [...editedById.values()].sort((a, b) => {
                    const cache = context.getState().audioCache;
                    const timing = createTimelineTimingContext(context.getState());
                    const aBounds = getAudioClipTimelineBounds(cache, a, timing);
                    const bBounds = getAudioClipTimelineBounds(cache, b, timing);
                    return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
                });
                for (const edited of editedClips) {
                    next = resolveAudioClipOverlapWithCache(
                        { ...track, clips: next }, edited, context.getState().audioCache, createTimelineTimingContext(context.getState())
                    );
                }
                redoUpdates.push({ trackId, clips: next });
                undoUpdates.push({ trackId, clips: before });
            }
            const patch: TimelineCommandPatch = {
                redo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: redoUpdates } }],
                undo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: undoUpdates } }],
            };
            applyPatch(context, patch);
            return { patches: patch };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}

export function createSetMultipleAudioClipOffsetsCommand(
    payload: SetMultipleAudioClipOffsetsPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    const updateCommand = createUpdateAudioClipsCommand(
        {
            updates: (payload.offsets ?? []).map((entry) => ({
                trackId: entry.trackId,
                clipId: entry.clipId,
                patch: { offsetTicks: entry.offsetTicks },
            })),
        },
        metadataOverride ?? {
            commandId: 'timeline.setMultipleAudioClipOffsets',
            undoLabel: (payload.offsets?.length ?? 0) > 1 ? 'Move Audio Clips' : 'Move Audio Clip',
            telemetryEvent: 'timeline_set_multiple_audio_clip_offsets',
        },
    );
    return {
        ...updateCommand,
        id: 'timeline.setMultipleAudioClipOffsets',
    };
}

export function createRemoveAudioClipsCommand(
    payload: RemoveAudioClipsPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.removeAudioClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.removeAudioClips',
                undoLabel: 'Remove Audio Clips',
                telemetryEvent: 'timeline_remove_audio_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<void>> {
            const targetsByTrack = new Map<string, Set<string>>();
            for (const target of payload.clips ?? []) {
                if (!targetsByTrack.has(target.trackId)) targetsByTrack.set(target.trackId, new Set());
                targetsByTrack.get(target.trackId)?.add(target.clipId);
            }
            const restoreClips: TimelinePatchRestoreAudioClipsPayload['clips'] = [];
            const removeTargets: RemoveAudioClipsPayload['clips'] = [];
            for (const [trackId, clipIds] of targetsByTrack) {
                const track = getAudioTrack(context, trackId);
                if (!track || !Array.isArray(track.clips)) continue;
                track.clips.forEach((clip, index) => {
                    if (!clipIds.has(clip.id)) return;
                    restoreClips.push({ trackId, clip, index });
                    removeTargets.push({ trackId, clipId: clip.id });
                });
            }
            const snapshot = context.getState();
            const nextTracks = { ...snapshot.tracks };
            for (const [trackId, clipIds] of targetsByTrack) {
                const track = nextTracks[trackId];
                if (!track || track.type !== 'audio' || !Array.isArray(track.clips)) continue;
                nextTracks[trackId] = { ...track, clips: track.clips.filter((clip) => !clipIds.has(clip.id)) };
            }
            const referencedAfter = findReferencedAudioSourceIds({ ...snapshot, tracks: nextTracks });
            const removedSources = new Set(restoreClips.map((entry) => entry.clip.sourceId));
            const audioCacheKeys = [...removedSources].filter((sourceId) => !referencedAfter.has(sourceId));
            const audioFeatureCacheKeys = audioCacheKeys.filter((sourceId) => Boolean(snapshot.audioFeatureCaches[sourceId]));
            const restoreCache = audioCacheKeys
                .map((key) => {
                    const value = snapshot.audioCache[key];
                    return value ? { key, value: buildLightweightAudioCacheEntry(value) } : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
            const restoreFeatureCaches = audioFeatureCacheKeys
                .map((key) => {
                    const value = snapshot.audioFeatureCaches[key];
                    return value && estimateFeatureCacheBytes(value) <= LARGE_UNDO_FEATURE_CACHE_BYTES ? { key, value } : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

            const patch: TimelineCommandPatch = {
                redo: [
                    {
                        action: 'timeline/REMOVE_AUDIO_CLIPS',
                        payload: { clips: removeTargets, audioCacheKeys, audioFeatureCacheKeys },
                    },
                ],
                undo: [
                    {
                        action: 'timeline/RESTORE_AUDIO_CLIPS',
                        payload: { clips: restoreClips, audioCache: restoreCache, audioFeatureCaches: restoreFeatureCaches },
                    },
                ],
            };
            applyPatch(context, patch);
            return { patches: patch };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}

export function createMoveAudioClipsBetweenTracksCommand(
    payload: MoveAudioClipsBetweenTracksPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<MoveAudioClipsBetweenTracksResult> {
    return {
        id: 'timeline.moveAudioClipsBetweenTracks',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.moveAudioClipsBetweenTracks',
                undoLabel: (payload.moves?.length ?? 0) > 1 ? 'Move Audio Clips' : 'Move Audio Clip',
                telemetryEvent: 'timeline_move_audio_clips_between_tracks',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<MoveAudioClipsBetweenTracksResult>> {
            const snapshot = context.getState();
            const affectedTrackIds = new Set<string>();
            for (const move of payload.moves ?? []) {
                affectedTrackIds.add(move.sourceTrackId);
                affectedTrackIds.add(move.destinationTrackId);
            }
            const beforeByTrack = new Map<string, AudioClip[]>();
            for (const trackId of affectedTrackIds) {
                const track = getAudioTrack(context, trackId);
                if (track) beforeByTrack.set(trackId, normalizeStoredClips(track, context));
            }
            const workingByTrack = new Map<string, AudioClip[]>();
            for (const [trackId, clips] of beforeByTrack) {
                workingByTrack.set(trackId, [...clips]);
            }
            const movedClipIds: string[] = [];
            for (const move of payload.moves ?? []) {
                const srcClips = workingByTrack.get(move.sourceTrackId);
                if (!srcClips) continue;
                const clipIndex = srcClips.findIndex((clip) => clip.id === move.clipId);
                if (clipIndex < 0) continue;
                const [clip] = srcClips.splice(clipIndex, 1);
                const destTrack = snapshot.tracks[move.destinationTrackId];
                if (!destTrack || destTrack.type !== 'audio') continue;
                if (!snapshot.audioCache[clip.sourceId]) continue;
                const movedClip: AudioClip = { ...clip, offsetTicks: sanitizeOffsetTicks(move.newOffsetTicks) };
                const destClips = workingByTrack.get(move.destinationTrackId) ?? [];
                workingByTrack.set(move.destinationTrackId, destClips);
                workingByTrack.set(
                    move.destinationTrackId,
                    resolveAudioClipOverlapWithCache(
                        { ...destTrack, clips: destClips }, movedClip, snapshot.audioCache, createTimelineTimingContext(snapshot)
                    ),
                );
                movedClipIds.push(clip.id);
            }
            const redoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            const undoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            for (const trackId of affectedTrackIds) {
                redoUpdates.push({ trackId, clips: workingByTrack.get(trackId) ?? [] });
                undoUpdates.push({ trackId, clips: beforeByTrack.get(trackId) ?? [] });
            }
            const patch: TimelineCommandPatch = {
                redo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: redoUpdates } }],
                undo: [{ action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: undoUpdates } }],
            };
            applyPatch(context, patch);
            return { patches: patch, result: { movedClipIds } };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}

export function createPasteAudioClipsCommand(
    payload: PasteAudioClipsPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<PasteAudioClipsResult> {
    return {
        id: 'timeline.pasteAudioClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.pasteAudioClips',
                undoLabel: 'Paste Audio Clips',
                telemetryEvent: 'timeline_paste_audio_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<PasteAudioClipsResult>> {
            const snapshot = context.getState();
            const missingAudioCache = (payload.audioCache ?? []).filter((entry) => !snapshot.audioCache[entry.key]);
            const missingFeatureCaches = (payload.audioFeatureCaches ?? []).filter(
                (entry) => !snapshot.audioFeatureCaches[entry.key],
            );
            const effectiveAudioCache = {
                ...snapshot.audioCache,
                ...Object.fromEntries(missingAudioCache.map((entry) => [entry.key, entry.value])),
            };
            const createdTracks = (payload.createTracks ?? []).filter((entry) => !snapshot.tracks[entry.trackId]);
            const createdTrackPayloads: TimelinePatchAddTrackPayload[] = createdTracks.map((entry) => ({
                track: {
                    id: entry.trackId,
                    name: entry.name || 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [],
                } as AudioTrack,
                index: entry.index,
            }));

            const virtualTracks = { ...snapshot.tracks };
            for (const entry of createdTrackPayloads) {
                virtualTracks[entry.track.id] = entry.track;
            }

            const clipsByTrack = new Map<string, AudioClip[]>();
            const clipIds: string[] = [];
            for (const entry of payload.clips ?? []) {
                const track = virtualTracks[entry.trackId];
                if (!track || track.type !== 'audio') continue;
                const clip = buildClip(entry.clip);
                if (!effectiveAudioCache[clip.sourceId]) continue;
                clipIds.push(clip.id);
                if (!clipsByTrack.has(entry.trackId)) clipsByTrack.set(entry.trackId, []);
                clipsByTrack.get(entry.trackId)?.push(clip);
            }

            const redoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            const undoUpdates: Array<{ trackId: string; clips: AudioClip[] }> = [];
            for (const [trackId, pastedClips] of clipsByTrack) {
                const track = virtualTracks[trackId] as AudioTrack | undefined;
                if (!track || track.type !== 'audio') continue;
                const before = trackId in snapshot.tracks ? normalizeStoredClips(snapshot.tracks[trackId] as AudioTrack, context) : [];
                let next = before;
                for (const clip of pastedClips.sort((a, b) => {
                    const timing = createTimelineTimingContext(snapshot);
                    const aBounds = getAudioClipTimelineBounds(effectiveAudioCache, a, timing);
                    const bBounds = getAudioClipTimelineBounds(effectiveAudioCache, b, timing);
                    return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
                })) {
                    next = resolveAudioClipOverlapWithCache(
                        { ...track, clips: next }, clip, effectiveAudioCache, createTimelineTimingContext(snapshot)
                    );
                }
                redoUpdates.push({ trackId, clips: next });
                if (trackId in snapshot.tracks) {
                    undoUpdates.push({ trackId, clips: before });
                }
            }

            const redo: TimelinePatchAction[] = [
                ...(missingAudioCache.length || missingFeatureCaches.length
                    ? [
                          {
                              action: 'timeline/RESTORE_AUDIO_CLIPS' as const,
                              payload: {
                                  clips: [],
                                  audioCache: missingAudioCache,
                                  audioFeatureCaches: missingFeatureCaches,
                              },
                          },
                      ]
                    : []),
                ...createdTrackPayloads.map((trackPayload) => ({
                    action: 'timeline/ADD_TRACK' as const,
                    payload: trackPayload,
                })),
                { action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: redoUpdates } },
            ];
            const undo: TimelinePatchAction[] = [
                { action: 'timeline/UPDATE_AUDIO_CLIPS', payload: { updates: undoUpdates } },
            ];
            if (createdTrackPayloads.length) {
                undo.push({
                    action: 'timeline/REMOVE_TRACKS',
                    payload: { trackIds: createdTrackPayloads.map((entry) => entry.track.id) },
                });
            }
            if (missingAudioCache.length || missingFeatureCaches.length) {
                undo.push({
                    action: 'timeline/REMOVE_AUDIO_CLIPS',
                    payload: {
                        clips: [],
                        audioCacheKeys: missingAudioCache.map((entry) => entry.key),
                        audioFeatureCacheKeys: missingFeatureCaches.map((entry) => entry.key),
                    },
                });
            }
            const patch: TimelineCommandPatch = { redo, undo };
            applyPatch(context, patch);
            return {
                patches: patch,
                result: {
                    clipIds,
                    trackIds: [...new Set([...clipsByTrack.keys(), ...createdTrackPayloads.map((entry) => entry.track.id)])],
                },
            };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}
