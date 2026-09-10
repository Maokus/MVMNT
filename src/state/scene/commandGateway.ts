import { createSceneSnapshot, useSceneStore, type SceneImportPayload } from '@state/sceneStore';
import { ensureMacroSync } from './macroSyncService';
import {
    emitSceneCommandTelemetry,
    type SceneCommandMergeContext,
    type SceneCommandOptions,
    type SceneCommandResult,
} from './sceneTelemetry';
import { sceneCommandDefinition, type SceneRollbackStrategy, type SceneStoreBoundary } from './commandDefinitions';
import { applySceneStoreCommand } from './commandApply';
import { buildSceneCommandPatch, type SceneCommandPatch } from './commandPatch';
import type { SceneCommand } from './commandTypes';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { runWithoutDocumentRevision } from '@state/documentRevisionStore';
import {
    createTimelineStoreSnapshot,
    restoreTimelineStoreSnapshot,
    type TimelineStoreSnapshot,
} from '@state/timeline/persistenceAdapter';
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
    boundary: Exclude<SceneStoreBoundary, 'scene'>;
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
                    ? (dependencies.rollbackParticipants ?? [])
                          .filter((participant) => definition.boundaries.includes(participant.boundary))
                          .map((participant) => ({ participant, snapshot: participant.capture() }))
                    : [];
            const patch = buildSceneCommandPatch(store, command);

            let result: SceneCommandResult;
            try {
                runWithoutDocumentRevision(() =>
                    applySceneStoreCommand(store, command, () => dependencies.store.getState())
                );
                if (patch) dependencies.markDocumentChanged?.(command.type);
                result = { success: true, durationMs: now() - start, command, patch };
            } catch (error) {
                const rollbackErrors: unknown[] = [];
                if (rollbackSnapshot) {
                    try {
                        dependencies.store.getState().importScene(rollbackSnapshot);
                    } catch (rollbackError) {
                        rollbackErrors.push(rollbackError);
                    }
                }
                for (const { participant, snapshot } of [...participantSnapshots].reverse()) {
                    try {
                        participant.restore(snapshot);
                    } catch (rollbackError) {
                        rollbackErrors.push(rollbackError);
                    }
                }
                const commandError = error instanceof Error ? error : new Error(String(error));
                result = {
                    success: false,
                    durationMs: now() - start,
                    command,
                    error: rollbackErrors.length
                        ? new AggregateError([commandError, ...rollbackErrors], 'Scene command and rollback failed')
                        : commandError,
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
            boundary: 'timeline',
            capture: () => createTimelineStoreSnapshot(useTimelineStore.getState()),
            restore: (snapshot) =>
                restoreTimelineStoreSnapshot(
                    (timelineSnapshot) => useTimelineStore.setState(timelineSnapshot),
                    snapshot as TimelineStoreSnapshot
                ),
        },
        {
            boundary: 'metadata',
            capture: () => ({ ...useSceneMetadataStore.getState().metadata }),
            restore: (snapshot) => useSceneMetadataStore.getState().hydrate(snapshot as any),
        },
        {
            boundary: 'assets',
            capture: () => {
                const state = useVisualAssetRegistryStore.getState();
                return { assets: state.assets, assetsOrder: state.assetsOrder };
            },
            restore: (snapshot) => useVisualAssetRegistryStore.setState(snapshot as any),
        },
        {
            boundary: 'runtime',
            capture: () => {
                const state = useSceneEditorStore.getState();
                return {
                    automationExpandedOwners: state.automationExpandedOwners,
                    automationExpandedCurves: state.automationExpandedCurves,
                    automationSearchQuery: state.automationSearchQuery,
                    expandedPropertyGroups: state.expandedPropertyGroups,
                    activePropertyTab: state.activePropertyTab,
                    propertyClipboard: state.propertyClipboard,
                    transientNodeTransforms: state.transientNodeTransforms,
                    runtimeRevision: state.runtimeRevision,
                    lastMutationSource: state.lastMutationSource,
                    hasInitializedScene: state.hasInitializedScene,
                    lastHydratedAt: state.lastHydratedAt,
                };
            },
            restore: (snapshot) => useSceneEditorStore.setState(snapshot as any),
        },
    ],
});

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    return sceneCommandGateway.dispatch(command, options);
}
