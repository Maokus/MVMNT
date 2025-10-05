import type { TimelineCommand, TimelineCommandId } from './commandTypes';
import {
    createAddTrackCommand,
    type AddTrackCommandPayload,
    type AddTrackCommandResult,
} from './commands/addTrackCommand';
import {
    createRemoveTracksCommand,
    type RemoveTracksCommandPayload,
} from './commands/removeTracksCommand';
import {
    createSetTrackOffsetTicksCommand,
    type SetTrackOffsetTicksPayload,
} from './commands/setTrackOffsetTicksCommand';

export interface TimelineCommandRegistration<TPayload, TResult = void> {
    id: TimelineCommandId;
    buildMetadata: (payload: TPayload) => TimelineCommand['metadata'];
    factory: (payload: TPayload, metadata: TimelineCommand['metadata']) => TimelineCommand<TResult>;
}

type TimelineRegistryMap = {
    'timeline.addTrack': TimelineCommandRegistration<AddTrackCommandPayload, AddTrackCommandResult>;
    'timeline.removeTracks': TimelineCommandRegistration<RemoveTracksCommandPayload>;
    'timeline.setTrackOffsetTicks': TimelineCommandRegistration<SetTrackOffsetTicksPayload>;
};

const registry: TimelineRegistryMap = {
    'timeline.addTrack': {
        id: 'timeline.addTrack',
        buildMetadata: () => ({
            commandId: 'timeline.addTrack',
            undoLabel: 'Add Track',
            telemetryEvent: 'timeline_add_track',
        }),
        factory: (payload, metadata) => createAddTrackCommand(payload, metadata),
    },
    'timeline.removeTracks': {
        id: 'timeline.removeTracks',
        buildMetadata: (payload) => ({
            commandId: 'timeline.removeTracks',
            undoLabel: payload.trackIds.length > 1 ? 'Remove Tracks' : 'Remove Track',
            telemetryEvent: 'timeline_remove_tracks',
        }),
        factory: (payload, metadata) => createRemoveTracksCommand(payload, metadata),
    },
    'timeline.setTrackOffsetTicks': {
        id: 'timeline.setTrackOffsetTicks',
        buildMetadata: () => ({
            commandId: 'timeline.setTrackOffsetTicks',
            undoLabel: 'Adjust Track Offset',
            telemetryEvent: 'timeline_set_track_offset',
        }),
        factory: (payload, metadata) => createSetTrackOffsetTicksCommand(payload, metadata),
    },
};

export function getTimelineCommandRegistration<TPayload, TResult = void>(
    id: TimelineCommandId,
): TimelineCommandRegistration<TPayload, TResult> | undefined {
    const entry = registry[id as keyof TimelineRegistryMap];
    return entry as unknown as TimelineCommandRegistration<TPayload, TResult> | undefined;
}

export function createTimelineCommand<TPayload, TResult = void>(
    id: TimelineCommandId,
    payload: TPayload,
): TimelineCommand<TResult> {
    const entry = getTimelineCommandRegistration<TPayload, TResult>(id);
    if (!entry) {
        throw new Error(`Unknown timeline command: ${id}`);
    }
    const metadata = entry.buildMetadata(payload);
    return entry.factory(payload, metadata);
}

export function listTimelineCommandIds(): TimelineCommandId[] {
    return Object.keys(registry) as TimelineCommandId[];
}
