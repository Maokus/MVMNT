import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    autoAdjustSceneRangeIfNeeded,
} from '../timelineShared';
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
            const previousOffset = (track as any).offsetTicks ?? 0;
            context.setState((current) => ({
                tracks: {
                    ...current.tracks,
                    [payload.trackId]: { ...current.tracks[payload.trackId], offsetTicks: payload.offsetTicks },
                },
            }));
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
