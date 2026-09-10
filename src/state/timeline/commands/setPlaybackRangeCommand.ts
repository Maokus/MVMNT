import type { TimelineCommand, TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import { applyTimelinePatchActions, type TimelineCommandPatch } from '../patches';
import { normalizePlaybackRange } from '../viewState';

export interface SetPlaybackRangePayload {
    startTick?: number;
    endTick?: number;
}

export function createSetPlaybackRangeCommand(
    payload: SetPlaybackRangePayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<void> {
    return {
        id: 'timeline.setPlaybackRange',
        mode: 'serial',
        metadata: metadataOverride ?? {
            commandId: 'timeline.setPlaybackRange',
            undoLabel: 'Set Playback Range',
            telemetryEvent: 'timeline_set_playback_range',
        },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const next = normalizePlaybackRange(payload.startTick, payload.endTick);
            const previous = state.playbackRange;
            const unchanged =
                state.playbackRangeUserDefined &&
                previous?.startTick === next?.startTick &&
                previous?.endTick === next?.endTick;
            const patches: TimelineCommandPatch = unchanged
                ? { undo: [], redo: [] }
                : {
                      undo: [
                          {
                              action: 'timeline/SET_PLAYBACK_RANGE',
                              payload: {
                                  playbackRange: previous,
                                  playbackRangeUserDefined: state.playbackRangeUserDefined,
                              },
                          },
                      ],
                      redo: [
                          {
                              action: 'timeline/SET_PLAYBACK_RANGE',
                              payload: { playbackRange: next, playbackRangeUserDefined: true },
                          },
                      ],
                  };
            applyTimelinePatchActions(context, patches.redo);
            return { patches };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}
