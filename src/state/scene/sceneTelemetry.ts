import type { SceneCommandPatch } from './commandPatch';
import type { SceneCommand } from './commandTypes';

export interface SceneCommandResult {
    success: boolean;
    durationMs: number;
    command: SceneCommand;
    error?: Error;
    patch?: SceneCommandPatch | null;
}

export interface SceneCommandMergeContext extends SceneCommandResult {
    source: string;
}

export interface SceneCommandOptions {
    source?: string;
    mergeKey?: string;
    transient?: boolean;
    canMergeWith?: (other: SceneCommandMergeContext) => boolean;
}

export interface SceneCommandTelemetryEvent extends SceneCommandMergeContext {
    mergeKey?: string;
    transient?: boolean;
    canMergeWith?: SceneCommandOptions['canMergeWith'];
}

type SceneCommandListener = (event: SceneCommandTelemetryEvent) => void;

const listeners = new Set<SceneCommandListener>();

export function registerSceneCommandListener(listener: SceneCommandListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function clearSceneCommandListeners(): void {
    listeners.clear();
}

export function emitSceneCommandTelemetry(result: SceneCommandResult, options: SceneCommandOptions | undefined): void {
    if (!listeners.size) return;
    const event: SceneCommandTelemetryEvent = {
        ...result,
        source: options?.source ?? 'store',
        mergeKey: options?.mergeKey,
        transient: options?.transient ?? false,
        canMergeWith: options?.canMergeWith,
    };
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[sceneTelemetry] listener threw during dispatch', error);
        }
    }
}
