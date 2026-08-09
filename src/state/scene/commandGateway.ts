import { createSceneSnapshot, useSceneStore, type SceneImportPayload } from '@state/sceneStore';
import { ensureMacroSync } from './macroSyncService';
import { emitSceneCommandTelemetry } from './sceneTelemetry';
import { sceneCommandDefinition, type SceneRollbackStrategy } from './commandDefinitions';
import { applySceneStoreCommand } from './commandApply';
import { buildSceneCommandPatch, type SceneCommandPatch } from './commandPatch';
import type { SceneCommand } from './commandTypes';
export type { SceneCommand } from './commandTypes';
export type { SceneCommandPatch } from './commandPatch';

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
    /** Human friendly source string for logging / telemetry */
    source?: string;
    /** Groups consecutive mutations into one undo entry. */
    mergeKey?: string;
    /** Marks the undo entry as replaceable until finalized. */
    transient?: boolean;
    canMergeWith?: (other: SceneCommandMergeContext) => boolean;
}

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function captureRollback(strategy: SceneRollbackStrategy): SceneImportPayload | null {
    switch (strategy) {
        case 'inverse-patch':
            return null;
        case 'snapshot':
        case 'transaction':
            return createSceneSnapshot(useSceneStore.getState());
    }
}

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    ensureMacroSync();
    const store = useSceneStore.getState();
    const definition = sceneCommandDefinition(command);
    const rollbackSnapshot = captureRollback(definition.rollback);
    const patch = buildSceneCommandPatch(store, command);

    let result: SceneCommandResult;
    try {
        applySceneStoreCommand(store, command);
        result = { success: true, durationMs: now() - start, command, patch };
    } catch (error) {
        if (rollbackSnapshot) {
            try {
                useSceneStore.getState().importScene(rollbackSnapshot);
            } catch {
                // Preserve the original command failure for telemetry and callers.
            }
        }
        result = {
            success: false,
            durationMs: now() - start,
            command,
            error: error instanceof Error ? error : new Error(String(error)),
            patch: null,
        };
    }
    emitSceneCommandTelemetry(result, options);
    return result;
}
