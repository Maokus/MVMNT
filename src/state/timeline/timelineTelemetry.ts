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
const LEGACY_SOURCE_PATTERN = /(legacy|direct)/i;

function validateTimelineTelemetry(event: TimelineCommandTelemetryEvent): boolean {
    if (!event) {
        console.warn('[timelineTelemetry] attempted to emit empty telemetry event');
        return false;
    }
    const requiredStringFields: Array<keyof TimelineCommandTelemetryEvent> = [
        'commandId',
        'undoLabel',
        'telemetryEvent',
        'source',
    ];
    for (const field of requiredStringFields) {
        const value = event[field];
        if (typeof value !== 'string' || !value.length) {
            console.warn('[timelineTelemetry] telemetry field missing or invalid', field, value);
            return false;
        }
    }
    if (!event.command || typeof event.command.execute !== 'function') {
        console.warn('[timelineTelemetry] telemetry event missing command reference', event);
        return false;
    }
    if (typeof event.success !== 'boolean') {
        console.warn('[timelineTelemetry] telemetry event missing success flag', event);
        return false;
    }
    if (typeof event.durationMs !== 'number' || !Number.isFinite(event.durationMs)) {
        console.warn('[timelineTelemetry] telemetry event missing duration', event);
        return false;
    }
    return true;
}

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
    if (!validateTimelineTelemetry(event)) {
        return;
    }
    if (LEGACY_SOURCE_PATTERN.test(event.source)) {
        console.warn('[timelineTelemetry] legacy telemetry source detected', event.source);
    }
    if (!listeners.size) return;
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[timelineTelemetry] listener error', error);
        }
    }
}
