import { globalMacroManager, type Macro } from '@bindings/macro-manager';
import {
    DEFAULT_SCENE_SETTINGS,
    useSceneStore,
    type BindingState,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneMacroDefinition,
    type SceneSerializedMacros,
    type SceneSettingsState,
    type SceneStoreState,
} from '@state/sceneStore';
import { createSceneElementInputFromSchema } from './storeElementFactory';

export type SceneCommand =
    | {
          type: 'addElement';
          elementType: string;
          elementId: string;
          config?: Record<string, unknown>;
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

export interface SceneCommandOptions {
    /** Human friendly source string for logging / telemetry */
    source?: string;
}

export interface SceneCommandResult {
    success: boolean;
    durationMs: number;
    command: SceneCommand;
    error?: Error;
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
        next[property] = normalizeBindingValue(value);
    }
    return next;
}

function createMacroPayload(state: SceneStoreState): SceneSerializedMacros | undefined {
    if (state.macros.allIds.length === 0) return undefined;
    const macros: Record<string, Macro> = {};
    for (const id of state.macros.allIds) {
        const macro = state.macros.byId[id];
        if (macro) macros[id] = { ...macro };
    }
    return {
        macros,
        exportedAt: state.macros.exportedAt,
    };
}

function importOrClearMacros(payload: SceneSerializedMacros | undefined | null) {
    if (payload && payload.macros && Object.keys(payload.macros).length > 0) {
        const normalized = {
            macros: payload.macros,
            exportedAt: payload.exportedAt ?? Date.now(),
        } satisfies Parameters<(typeof globalMacroManager)['importMacros']>[0];
        globalMacroManager.importMacros(normalized);
    } else {
        globalMacroManager.clearMacros();
    }
}

function applyMacroSideEffects(store: SceneStoreState, command: SceneCommand) {
    switch (command.type) {
        case 'clearScene': {
            if (command.clearMacros === false) {
                const snapshot = createMacroPayload(store);
                importOrClearMacros(snapshot ?? null);
            } else {
                globalMacroManager.clearMacros();
            }
            break;
        }
        case 'loadSerializedScene': {
            const snapshot = createMacroPayload(store);
            importOrClearMacros(snapshot ?? null);
            break;
        }
        case 'createMacro': {
            const { macroId, definition } = command;
            const options = definition.options ?? {};
            const initial = definition.defaultValue !== undefined ? definition.defaultValue : definition.value;
            const created = globalMacroManager.createMacro(macroId, definition.type, initial, options);
            if (created && !Object.is(initial, definition.value)) {
                globalMacroManager.updateMacroValue(macroId, definition.value);
            }
            break;
        }
        case 'updateMacroValue':
            globalMacroManager.updateMacroValue(command.macroId, command.value);
            break;
        case 'deleteMacro':
            globalMacroManager.deleteMacro(command.macroId);
            break;
        case 'importMacros':
            importOrClearMacros(command.payload);
            break;
        default:
            break;
    }
}

function applyStoreCommand(store: SceneStoreState, command: SceneCommand) {
    switch (command.type) {
        case 'addElement': {
            const input = createSceneElementInputFromSchema({
                id: command.elementId,
                type: command.elementType,
                config: command.config ?? {},
                createdBy: command.elementType,
            });
            store.addElement(input);
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
            const previousMacros = command.clearMacros === false ? createMacroPayload(store) : undefined;
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
            store.replaceMacros(command.payload);
            break;
        default:
            break;
    }
}

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function dispatchSceneCommand(command: SceneCommand, _options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    const store = useSceneStore.getState();

    try {
        applyStoreCommand(store, command);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            success: false,
            durationMs: now() - start,
            command,
            error: err,
        };
    }

    try {
        const latest = useSceneStore.getState();
        applyMacroSideEffects(latest, command);
    } catch (error) {
        console.warn('[scene command] macro side effects failed', error);
    }

    return {
        success: true,
        durationMs: now() - start,
        command,
    };
}
