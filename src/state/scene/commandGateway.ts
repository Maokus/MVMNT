import { createSceneSnapshot, useSceneStore, type SceneImportPayload } from '@state/sceneStore';
import { ensureMacroSync } from './macroSyncService';
import {
    emitSceneCommandTelemetry,
    type SceneCommandMergeContext,
    type SceneCommandOptions,
    type SceneCommandResult,
} from './sceneTelemetry';
import { sceneCommandDefinition, type SceneRollbackStrategy } from './commandDefinitions';
import { applySceneStoreCommand } from './commandApply';
import { buildSceneCommandPatch, type SceneCommandPatch } from './commandPatch';
import type { SceneCommand } from './commandTypes';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
export type { SceneCommand } from './commandTypes';
export type { SceneCommandPatch } from './commandPatch';

export type { SceneCommandMergeContext, SceneCommandOptions, SceneCommandResult } from './sceneTelemetry';

function now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export interface SceneCommandGatewayDependencies {
    store: Pick<typeof useSceneStore, 'getState'>;
    markDocumentChanged?: (source: string) => void;
    rollbackParticipants?: readonly SceneRollbackParticipant[];
}

export interface SceneRollbackParticipant {
    capture(): unknown;
    restore(snapshot: unknown): void;
}

export interface SceneCommandGateway {
    dispatch(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult;
}

function captureRollback(
    strategy: SceneRollbackStrategy,
    store: SceneCommandGatewayDependencies['store']
): SceneImportPayload | null {
    switch (strategy) {
        case 'inverse-patch':
            return null;
        case 'snapshot':
        case 'transaction':
            return createSceneSnapshot(store.getState());
    }
}

export function createSceneCommandGateway(dependencies: SceneCommandGatewayDependencies): SceneCommandGateway {
    return {
        dispatch(command, options) {
            const start = now();
            ensureMacroSync();
            const store = dependencies.store.getState();
            const definition = sceneCommandDefinition(command);
            const rollbackSnapshot = captureRollback(definition.rollback, dependencies.store);
            const participantSnapshots =
                definition.rollback === 'transaction'
                    ? (dependencies.rollbackParticipants ?? []).map((participant) => participant.capture())
                    : [];
            const patch = buildSceneCommandPatch(store, command);

            let result: SceneCommandResult;
            try {
                applySceneStoreCommand(store, command, () => dependencies.store.getState());
                dependencies.markDocumentChanged?.(command.type);
                result = { success: true, durationMs: now() - start, command, patch };
            } catch (error) {
                if (rollbackSnapshot) {
                    try {
                        dependencies.store.getState().importScene(rollbackSnapshot);
                    } catch {
                        // Preserve the original command failure for telemetry and callers.
                    }
                }
                for (let index = 0; index < participantSnapshots.length; index += 1) {
                    try {
                        dependencies.rollbackParticipants?.[index]?.restore(participantSnapshots[index]);
                    } catch {
                        // Preserve the command error; rollback participants are best effort.
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
        },
    };
}

export const sceneCommandGateway = createSceneCommandGateway({
    store: useSceneStore,
    markDocumentChanged: (source) => useSceneEditorStore.getState().markDocumentChanged(source),
    rollbackParticipants: [
        {
            capture: () => useTimelineStore.getState(),
            restore: (snapshot) =>
                useTimelineStore.setState(snapshot as ReturnType<typeof useTimelineStore.getState>, true),
        },
        {
            capture: () => useSceneMetadataStore.getState(),
            restore: (snapshot) =>
                useSceneMetadataStore.setState(snapshot as ReturnType<typeof useSceneMetadataStore.getState>, true),
        },
        {
            capture: () => useVisualAssetRegistryStore.getState(),
            restore: (snapshot) =>
                useVisualAssetRegistryStore.setState(
                    snapshot as ReturnType<typeof useVisualAssetRegistryStore.getState>,
                    true
                ),
        },
        {
            capture: () => useSceneEditorStore.getState(),
            restore: (snapshot) =>
                useSceneEditorStore.setState(snapshot as ReturnType<typeof useSceneEditorStore.getState>, true),
        },
    ],
});

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    return sceneCommandGateway.dispatch(command, options);
}
