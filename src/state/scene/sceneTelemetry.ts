import type { SceneCommandOptions, SceneCommandResult } from './commandGateway';

export interface SceneCommandTelemetryEvent extends SceneCommandResult {
    source: string;
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

export function emitSceneCommandTelemetry(
    result: SceneCommandResult,
    options: SceneCommandOptions | undefined,
): void {
    if (!listeners.size) return;
    const event: SceneCommandTelemetryEvent = {
        ...result,
        source: options?.source ?? 'store',
    };
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error('[sceneTelemetry] listener threw during dispatch', error);
        }
    }
}
