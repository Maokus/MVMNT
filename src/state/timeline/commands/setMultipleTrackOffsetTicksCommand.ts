import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import {
    autoAdjustSceneRangeIfNeeded,
    createTimelineTimingContext,
} from '../timelineShared';
import { secondsToTicksAt } from '../../timelineTime';
import {
    type TimelineCommandPatch,
    type TimelinePatchAction,
} from '../patches';

export interface SetMultipleTrackOffsetTicksPayload {
    offsets: Array<{ trackId: string; offsetTicks: number }>;
}

export function createSetMultipleTrackOffsetTicksCommand(
    payload: SetMultipleTrackOffsetTicksPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.setMultipleTrackOffsetTicks',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.setMultipleTrackOffsetTicks',
                undoLabel: 'Move Clips',
                telemetryEvent: 'timeline_set_multiple_track_offsets',
            },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const redoActions: TimelinePatchAction[] = [];
            const undoActions: TimelinePatchAction[] = [];

            for (const { trackId, offsetTicks } of payload.offsets) {
                const track = state.tracks[trackId];
                if (!track) continue;
                const previousOffset = (track as any).offsetTicks ?? 0;

                redoActions.push({
                    action: 'timeline/SET_TRACK_OFFSET_TICKS',
                    payload: { trackId, offsetTicks },
                });
                undoActions.push({
                    action: 'timeline/SET_TRACK_OFFSET_TICKS',
                    payload: { trackId, offsetTicks: previousOffset },
                });
            }

            if (!redoActions.length) {
                return { patches: { undo: [], redo: [] } };
            }

            // Apply all offset changes in a single setState call
            context.setState((current) => {
                let next: any = { tracks: { ...current.tracks } };
                for (const { trackId, offsetTicks } of payload.offsets) {
                    const track = current.tracks[trackId];
                    if (!track) continue;
                    next.tracks[trackId] = { ...track, offsetTicks };
                    // Recompute durationTicks for audio tracks
                    const cacheKey = (track as any).audioSourceId || trackId;
                    const cacheEntry = current.audioCache[cacheKey];
                    if ((track as any).type === 'audio' && cacheEntry?.audioBuffer) {
                        const ctx = createTimelineTimingContext(current);
                        const newDurationTicks = Math.round(secondsToTicksAt(ctx, cacheEntry.audioBuffer.duration, offsetTicks));
                        if (!next.audioCache) next.audioCache = { ...current.audioCache };
                        next.audioCache[cacheKey] = { ...cacheEntry, durationTicks: newDurationTicks };
                    }
                }
                return next;
            });

            autoAdjustSceneRangeIfNeeded(context.getState, context.setState);

            const patch: TimelineCommandPatch = {
                redo: redoActions,
                undo: undoActions,
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
