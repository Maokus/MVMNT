import type { TimelineState } from '../timelineStore';
import {
    type TimelineCommand,
    type TimelineCommandContext,
    type TimelineCommandDispatchOptions,
    type TimelineCommandDispatchResult,
    type TimelineCommandId,
    type TimelineSerializedCommandDescriptor,
} from './commandTypes';
import { createTimelineCommand } from './commandRegistry';
import { emitTimelineCommandTelemetry } from './timelineTelemetry';

export interface TimelineCommandGatewayDependencies {
    getState: () => TimelineState;
    setState: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;
    emitWindowEvent?: (type: string, detail?: unknown) => void;
    markDocumentChanged?: (source: string) => void;
}

export interface TimelineCommandGateway {
    dispatch<TResult = void>(
        command: TimelineCommand<TResult>,
        options?: TimelineCommandDispatchOptions
    ): Promise<TimelineCommandDispatchResult<TResult>>;
    dispatchById<TResult = void>(
        id: TimelineCommandId,
        payload: unknown,
        options?: TimelineCommandDispatchOptions
    ): Promise<TimelineCommandDispatchResult<TResult>>;
    dispatchDescriptor<TResult = void>(
        descriptor: TimelineSerializedCommandDescriptor
    ): Promise<TimelineCommandDispatchResult<TResult>>;
    getQueueDepth(): number;
    destroy(): void;
}

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultEmitWindowEvent(type: string, detail?: unknown) {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (error) {
        console.warn('[timeline][gateway] failed to emit window event', error);
    }
}

export function createTimelineCommandGateway(deps: TimelineCommandGatewayDependencies): TimelineCommandGateway {
    let queue: Promise<unknown> = Promise.resolve();
    let queueDepth = 0;
    let generation = 0;
    let destroyed = false;
    const emitWindowEvent = deps.emitWindowEvent ?? defaultEmitWindowEvent;

    function buildContext(): TimelineCommandContext {
        return {
            getState: deps.getState,
            setState: deps.setState,
            emitWindowEvent,
        };
    }

    async function runCommand<TResult>(
        command: TimelineCommand<TResult>,
        options?: TimelineCommandDispatchOptions,
        expectedGeneration = generation
    ): Promise<TimelineCommandDispatchResult<TResult>> {
        if (destroyed || expectedGeneration !== generation) {
            throw new Error('Timeline command gateway has been destroyed');
        }
        const context = buildContext();
        const start = now();
        try {
            const result = await command.execute(context);
            if (result.patches.undo.length || result.patches.redo.length) {
                deps.markDocumentChanged?.(command.id);
            }
            const durationMs = now() - start;
            emitTimelineCommandTelemetry({
                commandId: command.id,
                command,
                mode: command.mode,
                success: true,
                durationMs,
                patch: result.patches,
                result: result.result,
                source: options?.source ?? 'timeline-store',
                undoLabel: command.metadata.undoLabel,
                telemetryEvent: command.metadata.telemetryEvent,
                options,
                mergeKey: options?.mergeKey,
                transient: options?.transient,
                canMergeWith: options?.canMergeWith,
            });
            return { ...result, metadata: command.metadata };
        } catch (error) {
            const durationMs = now() - start;
            emitTimelineCommandTelemetry({
                commandId: command.id,
                command,
                mode: command.mode,
                success: false,
                durationMs,
                error: error instanceof Error ? error : new Error(String(error)),
                source: options?.source ?? 'timeline-store',
                undoLabel: command.metadata.undoLabel,
                telemetryEvent: command.metadata.telemetryEvent,
                options,
                mergeKey: options?.mergeKey,
                transient: options?.transient,
                canMergeWith: options?.canMergeWith,
            });
            throw error;
        }
    }

    async function enqueue<TResult>(
        command: TimelineCommand<TResult>,
        options?: TimelineCommandDispatchOptions
    ): Promise<TimelineCommandDispatchResult<TResult>> {
        const mode = options?.mode ?? command.mode;
        if (destroyed) throw new Error('Timeline command gateway has been destroyed');
        const commandGeneration = generation;
        if (mode === 'concurrent') {
            return runCommand(command, options, commandGeneration);
        }
        queueDepth += 1;
        if (queueDepth === 1) {
            const pending = runCommand(command, options, commandGeneration).finally(() => {
                queueDepth = Math.max(0, queueDepth - 1);
            });
            queue = pending;
            return pending;
        }
        queue = queue
            .catch(() => undefined)
            .then(() => runCommand(command, options, commandGeneration))
            .finally(() => {
                queueDepth = Math.max(0, queueDepth - 1);
            });
        return queue as Promise<TimelineCommandDispatchResult<TResult>>;
    }

    function validateDescriptor(descriptor: TimelineSerializedCommandDescriptor): void {
        if (!descriptor || typeof descriptor !== 'object') {
            throw new Error('Invalid timeline command descriptor');
        }
        if (descriptor.version !== 1) {
            throw new Error(`Unsupported timeline command descriptor version: ${descriptor.version}`);
        }
        if (!descriptor.type) {
            throw new Error('Descriptor missing command type');
        }
    }

    return {
        async dispatch<TResult>(
            command: TimelineCommand<TResult>,
            options?: TimelineCommandDispatchOptions
        ): Promise<TimelineCommandDispatchResult<TResult>> {
            return enqueue(command, options);
        },
        async dispatchById<TResult>(
            id: TimelineCommandId,
            payload: unknown,
            options?: TimelineCommandDispatchOptions
        ): Promise<TimelineCommandDispatchResult<TResult>> {
            const command = createTimelineCommand(id, payload);
            return enqueue(command as TimelineCommand<TResult>, options);
        },
        async dispatchDescriptor<TResult>(
            descriptor: TimelineSerializedCommandDescriptor
        ): Promise<TimelineCommandDispatchResult<TResult>> {
            validateDescriptor(descriptor);
            const command = createTimelineCommand(descriptor.type, descriptor.payload);
            return enqueue(command as TimelineCommand<TResult>, descriptor.options);
        },
        getQueueDepth(): number {
            return queueDepth;
        },
        destroy(): void {
            destroyed = true;
            generation += 1;
            queue = Promise.resolve();
            queueDepth = 0;
        },
    };
}
