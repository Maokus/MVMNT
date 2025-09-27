import type { HybridSceneBuilder } from '@core/scene-builder';
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

interface BuilderMutationResult {
    ok: boolean;
    message?: string;
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
        globalMacroManager.importMacros(payload);
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

function runBuilderMutation(builder: HybridSceneBuilder, command: SceneCommand): BuilderMutationResult {
    switch (command.type) {
        case 'addElement':
            return { ok: !!builder.addElement(command.elementType, command.elementId, command.config ?? {}) };
        case 'removeElement':
            return { ok: !!builder.removeElement(command.elementId) };
        case 'updateElementConfig':
            return { ok: !!builder.updateElementConfig(command.elementId, command.patch) };
        case 'moveElement':
            return { ok: !!builder.moveElement(command.elementId, command.targetIndex) };
        case 'duplicateElement':
            return { ok: !!builder.duplicateElement(command.sourceId, command.newId) };
        case 'updateElementId':
            return { ok: !!builder.updateElementId(command.currentId, command.nextId) };
        case 'clearScene':
            builder.clearScene();
            if (command.clearMacros !== false) globalMacroManager.clearMacros();
            return { ok: true };
        case 'resetSceneSettings':
            builder.resetSceneSettings?.();
            return { ok: true };
        case 'updateSceneSettings':
            builder.updateSceneSettings?.(command.patch);
            return { ok: true };
        case 'loadSerializedScene':
            return { ok: !!builder.loadScene(command.payload) };
        case 'createMacro':
        case 'updateMacroValue':
        case 'deleteMacro':
        case 'importMacros':
            // Macros are synchronized via the global macro manager side effects.
            return { ok: true };
        default:
            return { ok: true };
    }
}

function coerceArgs(
    builderOrCommand: HybridSceneBuilder | SceneCommand | null | undefined,
    maybeCommand?: SceneCommand | SceneCommandOptions,
    _maybeOptions?: SceneCommandOptions
): { builder: HybridSceneBuilder | null | undefined; command: SceneCommand } {
    if (builderOrCommand && typeof builderOrCommand === 'object' && 'type' in builderOrCommand) {
        return {
            builder: null,
            command: builderOrCommand as SceneCommand,
        };
    }
    return {
        builder: builderOrCommand as HybridSceneBuilder | null | undefined,
        command: (maybeCommand as SceneCommand) ?? ({} as SceneCommand),
    };
}

export function dispatchSceneCommand(
    builder: HybridSceneBuilder | null | undefined,
    command: SceneCommand,
    options?: SceneCommandOptions
): SceneCommandResult;
export function dispatchSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult;
export function dispatchSceneCommand(
    builderOrCommand: HybridSceneBuilder | SceneCommand | null | undefined,
    maybeCommand?: SceneCommand | SceneCommandOptions,
    maybeOptions?: SceneCommandOptions
): SceneCommandResult {
    const { builder, command } = coerceArgs(builderOrCommand, maybeCommand, maybeOptions);
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
        applyMacroSideEffects(store, command);
    } catch (error) {
        console.warn('[scene command] macro side effects failed', error);
    }

    if (builder) {
        try {
            const result = runBuilderMutation(builder, command);
            if (!result.ok) {
                return {
                    success: false,
                    durationMs: now() - start,
                    command,
                    error: result.message ? new Error(result.message) : undefined,
                };
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            return {
                success: false,
                durationMs: now() - start,
                command,
                error: err,
            };
        }
    }

    return {
        success: true,
        durationMs: now() - start,
        command,
    };
}

export function synchronizeSceneStoreFromBuilder(
    builder: HybridSceneBuilder,
    _options?: SceneCommandOptions
): SceneCommandResult {
    const start = now();
    try {
        const snapshot = builder.serializeScene();
        const store = useSceneStore.getState();
        store.importScene({
            elements: snapshot.elements,
            sceneSettings: snapshot.sceneSettings,
            macros: snapshot.macros,
        });
        applyMacroSideEffects(store, { type: 'loadSerializedScene', payload: snapshot });
        return {
            success: true,
            durationMs: now() - start,
            command: { type: 'loadSerializedScene', payload: snapshot },
        };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            success: false,
            durationMs: now() - start,
            command: { type: 'loadSerializedScene', payload: { elements: [], sceneSettings: null, macros: null } },
            error: err,
        };
    }
}
