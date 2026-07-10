import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    applyTimelinePatchActions,
    type TimelineCommandPatch,
    type TimelinePatchAction,
    type TimelinePatchAddTrackPayload,
    type TimelinePatchRestoreMidiClipsPayload,
} from '../patches';
import {
    enforceNonOverlappingMidiClips,
    findReferencedMidiSourceIds,
    getMidiClipTimelineBounds,
    makeMidiClipId,
    resolveMidiClipOverlapWithCache,
    type MidiClip,
} from '../midiClips';
import type { TimelineTrack } from '@state/timelineStore';

export interface AddMidiClipPayload {
    trackId: string;
    clip: Omit<MidiClip, 'id' | 'type'> & { id?: string; type?: 'midi' };
}

export interface AddMidiClipResult {
    clipId: string;
}

export interface RemoveMidiClipsPayload {
    clips: Array<{ trackId: string; clipId: string }>;
}

export interface UpdateMidiClipsPayload {
    updates: Array<{ trackId: string; clipId: string; patch: Partial<Omit<MidiClip, 'id' | 'type'>> }>;
}

export interface SetMultipleMidiClipOffsetsPayload {
    offsets: Array<{ trackId: string; clipId: string; offsetTicks: number }>;
}

export interface PasteMidiClipsPayload {
    createTracks?: Array<{ trackId: string; name: string; index?: number }>;
    clips: Array<{
        trackId: string;
        clip: Omit<MidiClip, 'type'> & { type?: 'midi' };
    }>;
}

export interface PasteMidiClipsResult {
    clipIds: string[];
    trackIds: string[];
}

function getMidiTrack(context: TimelineCommandContext, trackId: string): TimelineTrack | null {
    const track = context.getState().tracks[trackId];
    return track && track.type === 'midi' ? track : null;
}

function normalizeStoredClips(track: TimelineTrack, context: TimelineCommandContext): MidiClip[] {
    return enforceNonOverlappingMidiClips(track, context.getState().midiCache);
}

function buildUpdatePatch(trackId: string, before: MidiClip[], after: MidiClip[]): TimelineCommandPatch {
    return {
        redo: [{ action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: [{ trackId, clips: after }] } }],
        undo: [{ action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: [{ trackId, clips: before }] } }],
    };
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

function buildClip(input: AddMidiClipPayload['clip']): MidiClip {
    return {
        id: input.id || makeMidiClipId(),
        type: 'midi',
        sourceId: input.sourceId,
        offsetTicks: sanitizeOffsetTicks(input.offsetTicks),
        regionStartTick: sanitizeRegionTick(input.regionStartTick),
        regionEndTick: sanitizeRegionTick(input.regionEndTick),
        name: input.name,
        enabled: input.enabled,
    };
}

export function createAddMidiClipCommand(
    payload: AddMidiClipPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<AddMidiClipResult> {
    return {
        id: 'timeline.addMidiClip',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.addMidiClip',
                undoLabel: 'Add MIDI Clip',
                telemetryEvent: 'timeline_add_midi_clip',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<AddMidiClipResult>> {
            const track = getMidiTrack(context, payload.trackId);
            if (!track) throw new Error(`MIDI track not found: ${payload.trackId}`);
            const clip = buildClip(payload.clip);
            if (!context.getState().midiCache[clip.sourceId]) {
                throw new Error(`MIDI source not found: ${clip.sourceId}`);
            }
            const before = normalizeStoredClips(track, context);
            const after = resolveMidiClipOverlapWithCache({ ...track, clips: before }, clip, context.getState().midiCache);
            const patch = buildUpdatePatch(payload.trackId, before, after);
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

export function createUpdateMidiClipsCommand(
    payload: UpdateMidiClipsPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id: 'timeline.updateMidiClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.updateMidiClips',
                undoLabel: 'Update MIDI Clips',
                telemetryEvent: 'timeline_update_midi_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<void>> {
            const updatesByTrack = new Map<string, UpdateMidiClipsPayload['updates']>();
            for (const update of payload.updates ?? []) {
                if (!updatesByTrack.has(update.trackId)) updatesByTrack.set(update.trackId, []);
                updatesByTrack.get(update.trackId)?.push(update);
            }
            const redoUpdates: Array<{ trackId: string; clips: MidiClip[] }> = [];
            const undoUpdates: Array<{ trackId: string; clips: MidiClip[] }> = [];
            for (const [trackId, updates] of updatesByTrack) {
                const track = getMidiTrack(context, trackId);
                if (!track) continue;
                const before = normalizeStoredClips(track, context);
                const editedById = new Map<string, MidiClip>();
                for (const update of updates) {
                    const existing = editedById.get(update.clipId) ?? before.find((clip) => clip.id === update.clipId);
                    if (!existing) continue;
                    const edited: MidiClip = {
                        ...existing,
                        ...update.patch,
                        id: existing.id,
                        type: 'midi',
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
                    };
                    if (!context.getState().midiCache[edited.sourceId]) continue;
                    editedById.set(update.clipId, edited);
                }
                let next = before.filter((clip) => !editedById.has(clip.id));
                const editedClips = [...editedById.values()].sort((a, b) => {
                    const cache = context.getState().midiCache;
                    const aBounds = getMidiClipTimelineBounds(cache, a);
                    const bBounds = getMidiClipTimelineBounds(cache, b);
                    return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
                });
                for (const edited of editedClips) {
                    next = resolveMidiClipOverlapWithCache({ ...track, clips: next }, edited, context.getState().midiCache);
                }
                redoUpdates.push({ trackId, clips: next });
                undoUpdates.push({ trackId, clips: before });
            }
            const patch: TimelineCommandPatch = {
                redo: [{ action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: redoUpdates } }],
                undo: [{ action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: undoUpdates } }],
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

export function createSetMultipleMidiClipOffsetsCommand(
    payload: SetMultipleMidiClipOffsetsPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    const updateCommand = createUpdateMidiClipsCommand(
        {
            updates: (payload.offsets ?? []).map((entry) => ({
                trackId: entry.trackId,
                clipId: entry.clipId,
                patch: { offsetTicks: entry.offsetTicks },
            })),
        },
        metadataOverride ?? {
            commandId: 'timeline.setMultipleMidiClipOffsets',
            undoLabel: (payload.offsets?.length ?? 0) > 1 ? 'Move MIDI Clips' : 'Move MIDI Clip',
            telemetryEvent: 'timeline_set_multiple_midi_clip_offsets',
        }
    );
    return {
        ...updateCommand,
        id: 'timeline.setMultipleMidiClipOffsets',
    };
}

export function createRemoveMidiClipsCommand(
    payload: RemoveMidiClipsPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id: 'timeline.removeMidiClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.removeMidiClips',
                undoLabel: 'Remove MIDI Clips',
                telemetryEvent: 'timeline_remove_midi_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<void>> {
            const targetsByTrack = new Map<string, Set<string>>();
            for (const target of payload.clips ?? []) {
                if (!targetsByTrack.has(target.trackId)) targetsByTrack.set(target.trackId, new Set());
                targetsByTrack.get(target.trackId)?.add(target.clipId);
            }
            const restoreClips: TimelinePatchRestoreMidiClipsPayload['clips'] = [];
            const removeTargets: RemoveMidiClipsPayload['clips'] = [];
            for (const [trackId, clipIds] of targetsByTrack) {
                const track = getMidiTrack(context, trackId);
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
                if (!track || track.type !== 'midi' || !Array.isArray(track.clips)) continue;
                nextTracks[trackId] = { ...track, clips: track.clips.filter((clip) => !clipIds.has(clip.id)) };
            }
            const referencedAfter = findReferencedMidiSourceIds({ ...snapshot, tracks: nextTracks });
            const removedSources = new Set(restoreClips.map((entry) => entry.clip.sourceId));
            const midiCacheKeys = [...removedSources].filter((sourceId) => !referencedAfter.has(sourceId));
            const restoreCache = midiCacheKeys
                .map((key) => {
                    const value = snapshot.midiCache[key];
                    return value ? { key, value } : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

            const patch: TimelineCommandPatch = {
                redo: [
                    {
                        action: 'timeline/REMOVE_MIDI_CLIPS',
                        payload: { clips: removeTargets, midiCacheKeys },
                    },
                ],
                undo: [
                    {
                        action: 'timeline/RESTORE_MIDI_CLIPS',
                        payload: { clips: restoreClips, midiCache: restoreCache },
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

export function createPasteMidiClipsCommand(
    payload: PasteMidiClipsPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<PasteMidiClipsResult> {
    return {
        id: 'timeline.pasteMidiClips',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.pasteMidiClips',
                undoLabel: 'Paste MIDI Clips',
                telemetryEvent: 'timeline_paste_midi_clips',
            },
        async execute(context): Promise<TimelineCommandExecuteResult<PasteMidiClipsResult>> {
            const snapshot = context.getState();
            const createdTracks = (payload.createTracks ?? []).filter((entry) => !snapshot.tracks[entry.trackId]);
            const createdTrackPayloads: TimelinePatchAddTrackPayload[] = createdTracks.map((entry) => ({
                track: {
                    id: entry.trackId,
                    name: entry.name || 'MIDI Track',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [],
                } as TimelineTrack,
                index: entry.index,
            }));

            const virtualTracks = { ...snapshot.tracks };
            for (const entry of createdTrackPayloads) {
                virtualTracks[entry.track.id] = entry.track as TimelineTrack;
            }

            const clipsByTrack = new Map<string, MidiClip[]>();
            const clipIds: string[] = [];
            for (const entry of payload.clips ?? []) {
                const track = virtualTracks[entry.trackId];
                if (!track || track.type !== 'midi') continue;
                const clip = buildClip(entry.clip);
                if (!snapshot.midiCache[clip.sourceId]) continue;
                clipIds.push(clip.id);
                if (!clipsByTrack.has(entry.trackId)) clipsByTrack.set(entry.trackId, []);
                clipsByTrack.get(entry.trackId)?.push(clip);
            }

            const redoUpdates: Array<{ trackId: string; clips: MidiClip[] }> = [];
            const undoUpdates: Array<{ trackId: string; clips: MidiClip[] }> = [];
            for (const [trackId, pastedClips] of clipsByTrack) {
                const track = virtualTracks[trackId] as TimelineTrack | undefined;
                if (!track || track.type !== 'midi') continue;
                const before = trackId in snapshot.tracks
                    ? normalizeStoredClips(snapshot.tracks[trackId] as TimelineTrack, context)
                    : [];
                let next = before;
                for (const clip of pastedClips.sort((a, b) => {
                    const aBounds = getMidiClipTimelineBounds(snapshot.midiCache, a);
                    const bBounds = getMidiClipTimelineBounds(snapshot.midiCache, b);
                    return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
                })) {
                    next = resolveMidiClipOverlapWithCache({ ...track, clips: next }, clip, snapshot.midiCache);
                }
                redoUpdates.push({ trackId, clips: next });
                if (trackId in snapshot.tracks) {
                    undoUpdates.push({ trackId, clips: before });
                }
            }

            const redo: TimelinePatchAction[] = [
                ...createdTrackPayloads.map((trackPayload) => ({
                    action: 'timeline/ADD_TRACK' as const,
                    payload: trackPayload,
                })),
                { action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: redoUpdates } },
            ];
            const undo: TimelinePatchAction[] = [
                { action: 'timeline/UPDATE_MIDI_CLIPS', payload: { updates: undoUpdates } },
            ];
            if (createdTrackPayloads.length) {
                undo.push({
                    action: 'timeline/REMOVE_TRACKS',
                    payload: { trackIds: createdTrackPayloads.map((entry) => entry.track.id) },
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
