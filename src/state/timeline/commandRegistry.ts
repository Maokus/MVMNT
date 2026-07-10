import type { TimelineCommand, TimelineCommandId } from './commandTypes';
import {
    createAddTrackCommand,
    type AddTrackCommandPayload,
    type AddTrackCommandResult,
} from './commands/addTrackCommand';
import { createRemoveTracksCommand, type RemoveTracksCommandPayload } from './commands/removeTracksCommand';
import {
    createSetTrackOffsetTicksCommand,
    type SetTrackOffsetTicksPayload,
} from './commands/setTrackOffsetTicksCommand';
import {
    createSetMultipleTrackOffsetTicksCommand,
    type SetMultipleTrackOffsetTicksPayload,
} from './commands/setMultipleTrackOffsetTicksCommand';
import { createSetTrackPropertiesCommand, type SetTrackPropertiesPayload } from './commands/setTrackPropertiesCommand';
import { createReorderTracksCommand, type ReorderTracksPayload } from './commands/reorderTracksCommand';
import {
    createAddMidiClipCommand,
    createPasteMidiClipsCommand,
    createRemoveMidiClipsCommand,
    createSetMultipleMidiClipOffsetsCommand,
    createUpdateMidiClipsCommand,
    createMoveMidiClipsBetweenTracksCommand,
    type AddMidiClipPayload,
    type AddMidiClipResult,
    type PasteMidiClipsPayload,
    type PasteMidiClipsResult,
    type RemoveMidiClipsPayload,
    type SetMultipleMidiClipOffsetsPayload,
    type UpdateMidiClipsPayload,
    type MoveMidiClipsBetweenTracksPayload,
    type MoveMidiClipsBetweenTracksResult,
} from './commands/midiClipCommands';

export interface TimelineCommandRegistration<TPayload, TResult = void> {
    id: TimelineCommandId;
    buildMetadata: (payload: TPayload) => TimelineCommand['metadata'];
    factory: (payload: TPayload, metadata: TimelineCommand['metadata']) => TimelineCommand<TResult>;
}

type TimelineRegistryMap = {
    'timeline.addTrack': TimelineCommandRegistration<AddTrackCommandPayload, AddTrackCommandResult>;
    'timeline.removeTracks': TimelineCommandRegistration<RemoveTracksCommandPayload>;
    'timeline.setTrackOffsetTicks': TimelineCommandRegistration<SetTrackOffsetTicksPayload>;
    'timeline.setMultipleTrackOffsetTicks': TimelineCommandRegistration<SetMultipleTrackOffsetTicksPayload>;
    'timeline.setTrackProperties': TimelineCommandRegistration<SetTrackPropertiesPayload>;
    'timeline.reorderTracks': TimelineCommandRegistration<ReorderTracksPayload>;
    'timeline.addMidiClip': TimelineCommandRegistration<AddMidiClipPayload, AddMidiClipResult>;
    'timeline.removeMidiClips': TimelineCommandRegistration<RemoveMidiClipsPayload>;
    'timeline.updateMidiClips': TimelineCommandRegistration<UpdateMidiClipsPayload>;
    'timeline.setMultipleMidiClipOffsets': TimelineCommandRegistration<SetMultipleMidiClipOffsetsPayload>;
    'timeline.pasteMidiClips': TimelineCommandRegistration<PasteMidiClipsPayload, PasteMidiClipsResult>;
    'timeline.moveMidiClipsBetweenTracks': TimelineCommandRegistration<
        MoveMidiClipsBetweenTracksPayload,
        MoveMidiClipsBetweenTracksResult
    >;
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
    'timeline.setMultipleTrackOffsetTicks': {
        id: 'timeline.setMultipleTrackOffsetTicks',
        buildMetadata: (payload) => ({
            commandId: 'timeline.setMultipleTrackOffsetTicks',
            undoLabel: payload.offsets.length > 1 ? 'Move Clips' : 'Move Clip',
            telemetryEvent: 'timeline_set_multiple_track_offsets',
        }),
        factory: (payload, metadata) => createSetMultipleTrackOffsetTicksCommand(payload, metadata),
    },
    'timeline.setTrackProperties': {
        id: 'timeline.setTrackProperties',
        buildMetadata: () => ({
            commandId: 'timeline.setTrackProperties',
            undoLabel: 'Update Track Properties',
            telemetryEvent: 'timeline_set_track_properties',
        }),
        factory: (payload, metadata) => createSetTrackPropertiesCommand(payload, metadata),
    },
    'timeline.reorderTracks': {
        id: 'timeline.reorderTracks',
        buildMetadata: () => ({
            commandId: 'timeline.reorderTracks',
            undoLabel: 'Reorder Tracks',
            telemetryEvent: 'timeline_reorder_tracks',
        }),
        factory: (payload, metadata) => createReorderTracksCommand(payload, metadata),
    },
    'timeline.addMidiClip': {
        id: 'timeline.addMidiClip',
        buildMetadata: () => ({
            commandId: 'timeline.addMidiClip',
            undoLabel: 'Add MIDI Clip',
            telemetryEvent: 'timeline_add_midi_clip',
        }),
        factory: (payload, metadata) => createAddMidiClipCommand(payload, metadata),
    },
    'timeline.removeMidiClips': {
        id: 'timeline.removeMidiClips',
        buildMetadata: (payload) => ({
            commandId: 'timeline.removeMidiClips',
            undoLabel: payload.clips.length > 1 ? 'Remove MIDI Clips' : 'Remove MIDI Clip',
            telemetryEvent: 'timeline_remove_midi_clips',
        }),
        factory: (payload, metadata) => createRemoveMidiClipsCommand(payload, metadata),
    },
    'timeline.updateMidiClips': {
        id: 'timeline.updateMidiClips',
        buildMetadata: (payload) => ({
            commandId: 'timeline.updateMidiClips',
            undoLabel: payload.updates.length > 1 ? 'Update MIDI Clips' : 'Update MIDI Clip',
            telemetryEvent: 'timeline_update_midi_clips',
        }),
        factory: (payload, metadata) => createUpdateMidiClipsCommand(payload, metadata),
    },
    'timeline.setMultipleMidiClipOffsets': {
        id: 'timeline.setMultipleMidiClipOffsets',
        buildMetadata: (payload) => ({
            commandId: 'timeline.setMultipleMidiClipOffsets',
            undoLabel: payload.offsets.length > 1 ? 'Move MIDI Clips' : 'Move MIDI Clip',
            telemetryEvent: 'timeline_set_multiple_midi_clip_offsets',
        }),
        factory: (payload, metadata) => createSetMultipleMidiClipOffsetsCommand(payload, metadata),
    },
    'timeline.pasteMidiClips': {
        id: 'timeline.pasteMidiClips',
        buildMetadata: (payload) => ({
            commandId: 'timeline.pasteMidiClips',
            undoLabel: payload.clips.length > 1 ? 'Paste MIDI Clips' : 'Paste MIDI Clip',
            telemetryEvent: 'timeline_paste_midi_clips',
        }),
        factory: (payload, metadata) => createPasteMidiClipsCommand(payload, metadata),
    },
    'timeline.moveMidiClipsBetweenTracks': {
        id: 'timeline.moveMidiClipsBetweenTracks',
        buildMetadata: (payload) => ({
            commandId: 'timeline.moveMidiClipsBetweenTracks',
            undoLabel: payload.moves.length > 1 ? 'Move MIDI Clips' : 'Move MIDI Clip',
            telemetryEvent: 'timeline_move_midi_clips_between_tracks',
        }),
        factory: (payload, metadata) => createMoveMidiClipsBetweenTracksCommand(payload, metadata),
    },
};

export function getTimelineCommandRegistration<TPayload, TResult = void>(
    id: TimelineCommandId
): TimelineCommandRegistration<TPayload, TResult> | undefined {
    const entry = registry[id as keyof TimelineRegistryMap];
    return entry as unknown as TimelineCommandRegistration<TPayload, TResult> | undefined;
}

export function createTimelineCommand<TPayload, TResult = void>(
    id: TimelineCommandId,
    payload: TPayload
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
