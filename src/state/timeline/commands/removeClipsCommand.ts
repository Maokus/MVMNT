import type { TimelineCommand, TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import type { TimelineCommandPatch } from '../patches';
import { createRemoveAudioClipsCommand, type RemoveAudioClipsPayload } from './audioClipCommands';
import { createRemoveMidiClipsCommand, type RemoveMidiClipsPayload } from './midiClipCommands';

export interface RemoveClipsPayload {
    midiClips: RemoveMidiClipsPayload['clips'];
    audioClips: RemoveAudioClipsPayload['clips'];
}

export function createRemoveClipsCommand(
    payload: RemoveClipsPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id: 'timeline.removeClips',
        mode: 'serial',
        metadata: metadataOverride ?? {
            commandId: 'timeline.removeClips',
            undoLabel: 'Remove Clips',
            telemetryEvent: 'timeline_remove_clips',
        },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            let stagedState = context.getState();
            const stagedContext: TimelineCommandContext = {
                ...context,
                getState: () => stagedState,
                setState: (updater) => {
                    const update = updater(stagedState);
                    if (update !== stagedState) stagedState = { ...stagedState, ...update };
                },
            };
            const patches: TimelineCommandPatch[] = [];
            if (payload.midiClips.length) {
                patches.push(
                    (await createRemoveMidiClipsCommand({ clips: payload.midiClips }).execute(stagedContext)).patches
                );
            }
            if (payload.audioClips.length) {
                patches.push(
                    (await createRemoveAudioClipsCommand({ clips: payload.audioClips }).execute(stagedContext)).patches
                );
            }
            const patch: TimelineCommandPatch = {
                redo: patches.flatMap((entry) => entry.redo),
                undo: patches.reverse().flatMap((entry) => entry.undo),
            };
            if (patches.length) context.setState(() => stagedState);
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
