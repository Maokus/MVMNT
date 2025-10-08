import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    applyTimelinePatchActions,
    type TimelineCommandPatch,
    type TimelinePatchAction,
    type TimelinePatchRemoveTracksPayload,
    type TimelinePatchRestoreTracksPayload,
} from '../patches';

export interface RemoveTracksCommandPayload {
    trackIds: string[];
}

export function createRemoveTracksCommand(
    payload: RemoveTracksCommandPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.removeTracks',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.removeTracks',
                undoLabel: payload.trackIds.length > 1 ? 'Remove Tracks' : 'Remove Track',
                telemetryEvent: 'timeline_remove_tracks',
            },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const selectionBefore = state.selection.selectedTrackIds;
            const restorePayload: TimelinePatchRestoreTracksPayload = {
                tracks: [],
                selection: selectionBefore,
            };
            const removePayload: TimelinePatchRemoveTracksPayload = {
                trackIds: payload.trackIds,
                selection: selectionBefore,
            };
            const midiKeys: string[] = [];
            const audioKeys: string[] = [];
            const featureKeys: string[] = [];
            for (const id of payload.trackIds) {
                const track = state.tracks[id];
                if (!track) continue;
                const index = state.tracksOrder.indexOf(id);
                if (index === -1) continue;
                if (track.type === 'midi') {
                    const key = (track as any).midiSourceId ?? id;
                    const cache = state.midiCache[key];
                    if (cache) {
                        restorePayload.tracks.push({ track, index, midiCache: { key, value: cache } });
                        midiKeys.push(key);
                    } else {
                        restorePayload.tracks.push({ track, index });
                    }
                } else if (track.type === 'audio') {
                    const audioTrack = track as AudioTrack;
                    const key = audioTrack.audioSourceId ?? id;
                    const cache = state.audioCache[key];
                    if (cache) {
                        restorePayload.tracks.push({ track: audioTrack, index, audioCache: { key, value: cache } });
                        audioKeys.push(key);
                    } else {
                        restorePayload.tracks.push({ track: audioTrack, index });
                    }
                    const featureCache = (state as any).audioFeatureCaches?.[key] as
                        | import('@audio/features/audioFeatureTypes').AudioFeatureCache
                        | undefined;
                    if (featureCache) {
                        const entry = restorePayload.tracks[restorePayload.tracks.length - 1];
                        entry.audioFeatureCache = { key, value: featureCache };
                        featureKeys.push(key);
                    }
                }
            }
            if (midiKeys.length) {
                removePayload.midiCacheKeys = midiKeys;
            }
            if (audioKeys.length) {
                removePayload.audioCacheKeys = audioKeys;
            }
            if (featureKeys.length) {
                removePayload.audioFeatureCacheKeys = featureKeys;
            }
            const patch: TimelineCommandPatch = {
                redo: [
                    { action: 'timeline/REMOVE_TRACKS', payload: removePayload },
                ],
                undo: [
                    { action: 'timeline/RESTORE_TRACKS', payload: restorePayload },
                ],
            };
            applyTimelinePatchActions(
                { getState: context.getState, setState: context.setState },
                patch.redo,
            );
            return { patches: patch };
        },
        async undo(
            _context: TimelineCommandContext,
            patch: TimelineCommandPatch,
        ): Promise<TimelinePatchAction[]> {
            return patch.undo;
        },
        async redo(
            _context: TimelineCommandContext,
            patch: TimelineCommandPatch,
        ): Promise<TimelinePatchAction[]> {
            return patch.redo;
        },
    };
}
