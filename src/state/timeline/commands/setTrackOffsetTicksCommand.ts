import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    autoAdjustSceneRangeIfNeeded,
    createTimelineTimingContext,
} from '../timelineShared';
import {
    secondsToTicksAt,
} from '../../timelineTime';
import {
    type TimelineCommandPatch,
    type TimelinePatchAction,
} from '../patches';

export interface SetTrackOffsetTicksPayload {
    trackId: string;
    offsetTicks: number;
}

export function createSetTrackOffsetTicksCommand(
    payload: SetTrackOffsetTicksPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.setTrackOffsetTicks',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.setTrackOffsetTicks',
                undoLabel: 'Adjust Track Offset',
                telemetryEvent: 'timeline_set_track_offset',
            },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const track = state.tracks[payload.trackId];
            if (!track) {
                return {
                    patches: {
                        undo: [],
                        redo: [],
                    },
                };
            }
            const previousOffset = track.type === 'audio'
                ? (track.clips[0]?.offsetTicks ?? 0)
                : (track.offsetTicks ?? 0);
            context.setState((current) => {
                const currentTrack = current.tracks[payload.trackId];
                const nextTrack: any = currentTrack?.type === 'audio'
                    ? { ...currentTrack }
                    : { ...currentTrack, offsetTicks: payload.offsetTicks };
                if ((nextTrack.type === 'midi' || nextTrack.type === 'audio') && Array.isArray(nextTrack.clips)) {
                    if (nextTrack.clips.length === 1) {
                        nextTrack.clips = [{ ...nextTrack.clips[0], offsetTicks: payload.offsetTicks }];
                    } else if (nextTrack.clips.length > 1) {
                        const delta = payload.offsetTicks - previousOffset;
                        nextTrack.clips = nextTrack.clips.map((clip: any) => ({
                            ...clip,
                            offsetTicks: Math.max(0, (clip.offsetTicks ?? 0) + delta),
                        }));
                    }
                }
                return {
                    tracks: {
                        ...current.tracks,
                        [payload.trackId]: nextTrack,
                    },
                };
            });
            autoAdjustSceneRangeIfNeeded(context.getState, context.setState);
            const patch: TimelineCommandPatch = {
                redo: [
                    {
                        action: 'timeline/SET_TRACK_OFFSET_TICKS',
                        payload: { trackId: payload.trackId, offsetTicks: payload.offsetTicks },
                    },
                ],
                undo: [
                    {
                        action: 'timeline/SET_TRACK_OFFSET_TICKS',
                        payload: { trackId: payload.trackId, offsetTicks: previousOffset },
                    },
                ],
            };
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
