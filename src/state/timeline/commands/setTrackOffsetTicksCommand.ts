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
            const previousOffset = (track as any).offsetTicks ?? 0;
            context.setState((current) => {
                const next: any = {
                    tracks: {
                        ...current.tracks,
                        [payload.trackId]: { ...current.tracks[payload.trackId], offsetTicks: payload.offsetTicks },
                    },
                };
                // Recompute durationTicks for audio tracks so clip width reflects tempo at the new position
                const cacheKey = (track as any).audioSourceId || payload.trackId;
                const cacheEntry = current.audioCache[cacheKey];
                if ((track as any).type === 'audio' && cacheEntry?.audioBuffer) {
                    const ctx = createTimelineTimingContext(current);
                    const newDurationTicks = Math.round(secondsToTicksAt(ctx, cacheEntry.audioBuffer.duration, payload.offsetTicks));
                    next.audioCache = {
                        ...current.audioCache,
                        [cacheKey]: { ...cacheEntry, durationTicks: newDurationTicks },
                    };
                }
                return next;
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
