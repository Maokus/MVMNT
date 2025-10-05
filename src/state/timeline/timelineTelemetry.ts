import type { TimelineCommand } from './commandTypes';
import type { TimelineCommandPatch } from './patches';
import type { TimelineCommandDispatchOptions } from './commandTypes';
import type { TimelineCommandId, TimelineCommandMode } from './commandTypes';

export interface TimelineCommandTelemetryEvent {
    commandId: TimelineCommandId;
    command: TimelineCommand;
    mode: TimelineCommandMode;
    success: boolean;
    durationMs: number;
    patch?: TimelineCommandPatch;
    result?: unknown;
    error?: Error;
    source: string;
    undoLabel: string;
    telemetryEvent: string;
    options?: TimelineCommandDispatchOptions;
    mergeKey?: string;
    transient?: boolean;
    canMergeWith?: TimelineCommandDispatchOptions['canMergeWith'];
}

type TimelineCommandListener = (event: TimelineCommandTelemetryEvent) => void;

const listeners = new Set<TimelineCommandListener>();

export function registerTimelineCommandListener(listener: TimelineCommandListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function clearTimelineCommandListeners(): void {
    listeners.clear();
}

export function emitTimelineCommandTelemetry(event: TimelineCommandTelemetryEvent): void {
    if (!listeners.size) return;
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[timelineTelemetry] listener error', error);
        }
    }
}
