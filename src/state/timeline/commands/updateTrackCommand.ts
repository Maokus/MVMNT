import type { TimelineCommand, TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import { applyTimelinePatchActions, type TimelineCommandPatch } from '../patches';
import { createSetTrackOffsetTicksCommand } from './setTrackOffsetTicksCommand';
import { createSetTrackPropertiesCommand, type TrackPropertyPatch } from './setTrackPropertiesCommand';

export interface UpdateTrackPayload {
    trackId: string;
    offsetTicks?: number;
    properties?: TrackPropertyPatch;
}

export function createUpdateTrackCommand(
    payload: UpdateTrackPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id: 'timeline.updateTrack',
        mode: 'serial',
        metadata: metadataOverride ?? {
            commandId: 'timeline.updateTrack',
            undoLabel: 'Update Track',
            telemetryEvent: 'timeline_update_track',
        },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const patches: TimelineCommandPatch = { undo: [], redo: [] };
            try {
                if (typeof payload.offsetTicks === 'number') {
                    const result = await createSetTrackOffsetTicksCommand({
                        trackId: payload.trackId,
                        offsetTicks: payload.offsetTicks,
                    }).execute(context);
                    patches.undo.unshift(...result.patches.undo);
                    patches.redo.push(...result.patches.redo);
                }
                if (payload.properties && Object.keys(payload.properties).length) {
                    const result = await createSetTrackPropertiesCommand({
                        updates: [{ trackId: payload.trackId, patch: payload.properties }],
                    }).execute(context);
                    patches.undo.unshift(...result.patches.undo);
                    patches.redo.push(...result.patches.redo);
                }
                return { patches };
            } catch (error) {
                applyTimelinePatchActions(context, patches.undo);
                throw error;
            }
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}
