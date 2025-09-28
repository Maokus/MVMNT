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
                createdBy: command.elementType,
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

export function dispatchSceneCommand(command: SceneCommand, _options?: SceneCommandOptions): SceneCommandResult {
    const start = now();
    ensureMacroSync();
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

    return {
        success: true,
        durationMs: now() - start,
        command,
    };
}
