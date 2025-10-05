import {
    DEFAULT_SCENE_SETTINGS,
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneMacroDefinition,
    type SceneSerializedMacros,
    type SceneSettingsState,
    type SceneStoreState,
} from '@state/sceneStore';
import { createSceneElementInputFromSchema } from './storeElementFactory';
import { ensureMacroSync, getMacroSnapshot, replaceMacrosFromSnapshot } from './macroSyncService';
import { emitSceneCommandTelemetry } from './sceneTelemetry';

export type SceneCommand =
    | {
          type: 'addElement';
          elementType: string;
          elementId: string;
          config?: Record<string, unknown>;
          targetIndex?: number;
          createdAt?: number;
          createdBy?: string;
      }
    | {
          type: 'removeElement';
          elementId: string;
      }
    | {
          type: 'updateElementConfig';
          elementId: string;
          patch: Record<string, unknown>;
      }
    | {
          type: 'moveElement';
          elementId: string;
          targetIndex: number;
      }
    | {
          type: 'duplicateElement';
          sourceId: string;
          newId: string;
          insertAfter?: boolean;
      }
    | {
          type: 'updateElementId';
          currentId: string;
          nextId: string;
      }
    | {
          type: 'clearScene';
          clearMacros?: boolean;
      }
    | {
          type: 'resetSceneSettings';
      }
    | {
          type: 'updateSceneSettings';
          patch: Record<string, unknown>;
      }
    | {
          type: 'loadSerializedScene';
          payload: SceneImportPayload;
      }
    | {
          type: 'createMacro';
          macroId: string;
          definition: SceneMacroDefinition;
      }
    | {
          type: 'updateMacroValue';
          macroId: string;
          value: unknown;
      }
    | {
          type: 'deleteMacro';
          macroId: string;
      }
    | {
          type: 'importMacros';
          payload: SceneSerializedMacros;
      };

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
    /**
     * When provided, allows subsequent commands with the same key to merge into a single undo entry.
     * Useful for continuous gestures such as drag interactions.
     */
    mergeKey?: string;
    /** Marks the undo entry as transient so it can be replaced until finalized. */
    transient?: boolean;
    /** Optional guard to determine whether two telemetry events may merge. */
    canMergeWith?: (other: SceneCommandMergeContext) => boolean;
}

export interface SceneCommandPatch {
    undo: SceneCommand[];
    redo: SceneCommand[];
}

function normalizeBindingValue(value: unknown): BindingState {
    if (value && typeof value === 'object') {
        const payload = value as any;
        if (payload.type === 'macro' && typeof payload.macroId === 'string') {
            return { type: 'macro', macroId: payload.macroId };
        }
        if (payload.type === 'constant' && 'value' in payload) {
            return { type: 'constant', value: payload.value };
        }
    }
    return { type: 'constant', value };
}

function buildBindingsPatchFromConfig(patch: Record<string, unknown>): ElementBindingsPatch {
    const next: ElementBindingsPatch = {};
    for (const [property, value] of Object.entries(patch)) {
        if (value == null) {
            next[property] = null;
            continue;
        }
        next[property] = normalizeBindingValue(value);
    }
    return next;
}

function bindingEquals(a: BindingState | undefined, b: BindingState | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'constant' && b.type === 'constant') return Object.is(a.value, b.value);
    if (a.type === 'macro' && b.type === 'macro') return a.macroId === b.macroId;
    return false;
}

function bindingToConfigValue(binding: BindingState | undefined): unknown {
    if (!binding) return null;
    if (binding.type === 'macro') {
        return { type: 'macro', macroId: binding.macroId };
    }
    return { type: 'constant', value: binding.value };
}

function buildConfigFromBindings(bindings: ElementBindings): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const [key, binding] of Object.entries(bindings)) {
        config[key] = bindingToConfigValue(binding);
    }
    return config;
}

function captureSceneSnapshot(state: SceneStoreState): SceneImportPayload {
    const draft = state.exportSceneDraft();
    return {
        elements: draft.elements,
        sceneSettings: draft.sceneSettings,
        macros: draft.macros ?? null,
    };
}

function cloneCommand<T extends SceneCommand>(command: T): T {
    return JSON.parse(JSON.stringify(command)) as T;
}

function buildSceneCommandPatch(state: SceneStoreState, command: SceneCommand): SceneCommandPatch | null {
    switch (command.type) {
        case 'addElement': {
            if (state.elements[command.elementId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'removeElement',
                        elementId: command.elementId,
                    },
                ],
            };
        }
        case 'removeElement': {
            const element = state.elements[command.elementId];
            if (!element) return null;
            const bindings = state.bindings.byElement[command.elementId] ?? {};
            const index = state.order.indexOf(command.elementId);
            const config = buildConfigFromBindings(bindings);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'addElement',
                        elementType: element.type,
                        elementId: element.id,
                        config,
                        targetIndex: index,
                        createdAt: element.createdAt,
                        createdBy: element.createdBy,
                    },
                ],
            };
        }
        case 'updateElementConfig': {
            const existing = state.bindings.byElement[command.elementId];
            if (!existing) return null;
            const undoPatch: Record<string, unknown> = {};
            let changed = false;
            for (const [key, value] of Object.entries(command.patch)) {
                const nextBinding = value == null ? undefined : normalizeBindingValue(value);
                const current = existing[key];
                const isEqual = bindingEquals(current, nextBinding);
                if (isEqual) continue;
                changed = true;
                undoPatch[key] = current ? bindingToConfigValue(current) : null;
            }
            if (!changed) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateElementConfig',
                        elementId: command.elementId,
                        patch: undoPatch,
                    },
                ],
            };
        }
        case 'moveElement': {
            const currentIndex = state.order.indexOf(command.elementId);
            if (currentIndex === -1) return null;
            if (command.targetIndex === currentIndex) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'moveElement',
                        elementId: command.elementId,
                        targetIndex: currentIndex,
                    },
                ],
            };
        }
        case 'duplicateElement': {
            const source = state.elements[command.sourceId];
            if (!source || state.elements[command.newId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'removeElement',
                        elementId: command.newId,
                    },
                ],
            };
        }
        case 'updateElementId': {
            const element = state.elements[command.currentId];
            if (!element || command.currentId === command.nextId) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateElementId',
                        currentId: command.nextId,
                        nextId: command.currentId,
                    },
                ],
            };
        }
        case 'clearScene': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'resetSceneSettings': {
            const previous = { ...state.settings };
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateSceneSettings',
                        patch: previous,
                    },
                ],
            };
        }
        case 'updateSceneSettings': {
            const undoPatch: Record<string, unknown> = {};
            let changed = false;
            for (const [key, value] of Object.entries(command.patch)) {
                const prev = (state.settings as any)[key];
                if (Object.is(prev, value)) continue;
                changed = true;
                undoPatch[key] = prev;
            }
            if (!changed) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateSceneSettings',
                        patch: undoPatch,
                    },
                ],
            };
        }
        case 'loadSerializedScene': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'createMacro': {
            if (state.macros.byId[command.macroId]) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'deleteMacro',
                        macroId: command.macroId,
                    },
                ],
            };
        }
        case 'updateMacroValue': {
            const macro = state.macros.byId[command.macroId];
            if (!macro || Object.is(macro.value, command.value)) return null;
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'updateMacroValue',
                        macroId: command.macroId,
                        value: macro.value,
                    },
                ],
            };
        }
        case 'deleteMacro': {
            const macro = state.macros.byId[command.macroId];
            if (!macro) return null;
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        case 'importMacros': {
            const snapshot = captureSceneSnapshot(state);
            return {
                redo: [cloneCommand(command)],
                undo: [
                    {
                        type: 'loadSerializedScene',
                        payload: snapshot,
                    },
                ],
            };
        }
        default:
            return null;
    }
}

function readConstantNumber(binding: BindingState | undefined): number | null {
    if (!binding || binding.type !== 'constant') return null;
    const value = typeof binding.value === 'number' ? binding.value : Number(binding.value);
    return Number.isFinite(value) ? value : null;
}

function maybeCenterAxis(
    axis: 'X' | 'Y',
    options: {
        config?: Record<string, unknown>;
        bindings: ElementBindings;
        sceneSize: number | undefined;
    }
): void {
    const { config = {}, bindings, sceneSize } = options;
    if (!Number.isFinite(sceneSize) || sceneSize == null) return;
    const offsetKey = `offset${axis}` as const;
    const anchorKey = `anchor${axis}` as const;
    if (Object.prototype.hasOwnProperty.call(config, offsetKey)) return;
    const offsetBinding = bindings[offsetKey];
    if (offsetBinding?.type === 'macro') return;
    const currentOffset = readConstantNumber(offsetBinding) ?? 0;
    if (currentOffset !== 0) return;
    const anchorBinding = bindings[anchorKey];
    const anchor = readConstantNumber(anchorBinding);
    const anchorValue = anchor == null ? 0.5 : anchor;
    if (Math.abs(anchorValue - 0.5) > 1e-4) return;
    bindings[offsetKey] = { type: 'constant', value: sceneSize / 2 };
}

function applyStoreCommand(store: SceneStoreState, command: SceneCommand) {
    switch (command.type) {
        case 'addElement': {
            const input = createSceneElementInputFromSchema({
                id: command.elementId,
                type: command.elementType,
                config: command.config ?? {},
                index: command.targetIndex,
                createdAt: command.createdAt,
                createdBy: command.createdBy ?? command.elementType,
            });
            const bindings = { ...(input.bindings ?? {}) } as ElementBindings;
            const settings = store.settings;
            maybeCenterAxis('X', { config: command.config, bindings, sceneSize: settings.width });
            maybeCenterAxis('Y', { config: command.config, bindings, sceneSize: settings.height });
            store.addElement({ ...input, bindings });
            break;
        }
        case 'removeElement':
            store.removeElement(command.elementId);
            break;
        case 'updateElementConfig': {
            const patch = buildBindingsPatchFromConfig(command.patch);
            store.updateBindings(command.elementId, patch);
            break;
        }
        case 'moveElement':
            store.moveElement(command.elementId, command.targetIndex);
            break;
        case 'duplicateElement':
            store.duplicateElement(command.sourceId, command.newId, { insertAfter: command.insertAfter ?? true });
            break;
        case 'updateElementId':
            store.updateElementId(command.currentId, command.nextId);
            break;
        case 'clearScene': {
            const previousMacros = command.clearMacros === false ? getMacroSnapshot() ?? undefined : undefined;
            store.clearScene();
            if (command.clearMacros === false && previousMacros) {
                store.replaceMacros(previousMacros);
            }
            break;
        }
        case 'resetSceneSettings':
            store.updateSettings(DEFAULT_SCENE_SETTINGS);
            break;
        case 'updateSceneSettings':
            store.updateSettings(command.patch as Partial<SceneSettingsState>);
            break;
        case 'loadSerializedScene':
            store.importScene(command.payload);
            break;
        case 'createMacro':
            store.createMacro(command.macroId, command.definition);
            break;
        case 'updateMacroValue':
            store.updateMacroValue(command.macroId, command.value);
            break;
        case 'deleteMacro':
            store.deleteMacro(command.macroId);
            break;
        case 'importMacros':
            replaceMacrosFromSnapshot(command.payload);
            break;
        default:
            break;
    }
}

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    ensureMacroSync();
    const store = useSceneStore.getState();
    const patch = buildSceneCommandPatch(store, command);

    let result: SceneCommandResult;
    try {
        applyStoreCommand(store, command);
        result = {
            success: true,
            durationMs: now() - start,
            command,
            patch,
        };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        result = {
            success: false,
            durationMs: now() - start,
            command,
            error: err,
            patch: null,
        };
    }
    emitSceneCommandTelemetry(result, options);
    return result;
}
