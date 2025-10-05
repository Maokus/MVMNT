import type { TimelineState } from '../timelineStore';
import type { TimelineCommandPatch, TimelinePatchAction } from './patches';

export type TimelineCommandId =
    | 'timeline.addTrack'
    | 'timeline.removeTracks'
    | 'timeline.setTrackOffsetTicks'
    | 'timeline.setTrackProperties'
    | 'timeline.reorderTracks';

export type TimelineCommandMode = 'serial' | 'concurrent';

export interface TimelineCommandMetadata {
    commandId: TimelineCommandId;
    undoLabel: string;
    telemetryEvent: string;
}

export interface TimelineCommandContext {
    getState(): TimelineState;
    setState: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;
    emitWindowEvent: (type: string, detail?: unknown) => void;
}

export interface TimelineCommandExecuteResult<TResult = unknown> {
    patches: TimelineCommandPatch;
    result?: TResult;
}

export interface TimelineCommandDispatchResult<TResult = unknown> extends TimelineCommandExecuteResult<TResult> {
    metadata: TimelineCommand['metadata'];
}

export interface TimelineCommand<TResult = unknown> {
    readonly id: TimelineCommandId;
    readonly mode: TimelineCommandMode;
    readonly metadata: TimelineCommandMetadata;
    execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<TResult>>;
    undo(context: TimelineCommandContext, patch: TimelineCommandPatch): Promise<TimelinePatchAction[]>;
    redo(context: TimelineCommandContext, patch: TimelineCommandPatch): Promise<TimelinePatchAction[]>;
}

export interface TimelineCommandDispatchOptions {
    source?: string;
    mode?: TimelineCommandMode;
    mergeKey?: string;
    transient?: boolean;
    canMergeWith?: (event: unknown) => boolean;
}

export interface TimelineSerializedCommandDescriptor {
    type: TimelineCommandId;
    version: number;
    payload?: unknown;
    options?: TimelineCommandDispatchOptions;
}
