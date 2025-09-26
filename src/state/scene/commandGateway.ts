import { HybridSceneBuilder } from '@core/scene-builder';
import { globalMacroManager } from '@bindings/macro-manager';
import { serializeStable } from '@persistence/stable-stringify';
import type { Macro } from '@bindings/macro-manager';
import {
    DEFAULT_SCENE_SETTINGS,
    useSceneStore,
    type BindingState,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneMacroDefinition,
    type SceneSerializedMacros,
    type SceneSettingsState,
    type SceneStoreComputedExport,
    type SceneStoreState,
} from '@state/sceneStore';
import { createSceneElementInputFromSchema } from './storeElementFactory';
import { snapshotBuilder } from './snapshotBuilder';
import {
    enableSceneStoreDualWrite,
    enableSceneParityTelemetry,
    sceneParityMode,
    sceneParitySampleRate,
    type SceneParityMode,
} from '@config/featureFlags';

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
    /** Skip parity assertion even if the global mode is strict */
    skipParity?: boolean;
    /** Force parity assertion regardless of sampling */
    forceParity?: boolean;
    /** Override sample rate for tests */
    sampleOverride?: number;
}

export interface SceneCommandResult {
    success: boolean;
    durationMs: number;
    command: SceneCommand;
    parityChecked: boolean;
    parityMismatch?: SceneParityMismatch | null;
    error?: Error;
}

export interface SceneParityMismatch {
    mode: SceneParityMode;
    command: SceneCommand;
    storeSnapshot: SceneStoreComputedExport;
    builderSnapshot: BuilderSceneSnapshot;
    diffSummary: string;
    debug?: ReturnType<typeof snapshotBuilder>;
}

type BuilderSceneSnapshot = ReturnType<HybridSceneBuilder['serializeScene']>;

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

function normalizeMacrosPayload(source: SceneSerializedMacros | undefined | null): SceneSerializedMacros | undefined {
    if (!source || !source.macros) return undefined;
    const ids = Object.keys(source.macros);
    if (ids.length === 0) return undefined;
    return {
        macros: ids.reduce<Record<string, Macro>>((acc, id) => {
            acc[id] = { ...source.macros![id] };
            return acc;
        }, {}),
        exportedAt: source.exportedAt,
    };
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
            if (command.clearMacros !== false) {
                globalMacroManager.clearMacros();
            }
            return { ok: true };
        case 'resetSceneSettings':
            builder.resetSceneSettings();
            return { ok: true };
        case 'updateSceneSettings':
            builder.updateSceneSettings(command.patch);
            return { ok: true };
        case 'loadSerializedScene':
            return { ok: !!builder.loadScene(command.payload) };
        case 'createMacro': {
            const { macroId, definition } = command;
            const initial = definition.defaultValue !== undefined ? definition.defaultValue : definition.value;
            const created = globalMacroManager.createMacro(macroId, definition.type, initial, definition.options ?? {});
            if (!created) return { ok: false, message: `Failed to create macro '${macroId}'` };
            if (!Object.is(initial, definition.value)) {
                globalMacroManager.updateMacroValue(macroId, definition.value);
            }
            return { ok: true };
        }
        case 'updateMacroValue':
            return { ok: globalMacroManager.updateMacroValue(command.macroId, command.value) };
        case 'deleteMacro':
            return { ok: globalMacroManager.deleteMacro(command.macroId) };
        case 'importMacros':
            return { ok: globalMacroManager.importMacros(command.payload) };
        default:
            return { ok: false, message: 'Unsupported command type' };
    }
}

function shouldRunParity(options: SceneCommandOptions | undefined): boolean {
    if (options?.skipParity) return false;
    if (sceneParityMode === 'off') return false;
    if (sceneParityMode === 'strict') return true;
    const rate = options?.forceParity ? 1 : options?.sampleOverride ?? sceneParitySampleRate;
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    return Math.random() < rate;
}

function summarizeDiff(builderSnapshot: SceneStoreComputedExport, storeSnapshot: SceneStoreComputedExport): string {
    const builderIds = new Set(builderSnapshot.elements.map((el) => el.id));
    const storeIds = new Set(storeSnapshot.elements.map((el) => el.id));
    const missingInStore = Array.from(builderIds).filter((id) => !storeIds.has(id));
    const missingInBuilder = Array.from(storeIds).filter((id) => !builderIds.has(id));
    const parts: string[] = [];
    if (missingInStore.length) parts.push(`builder-only=[${missingInStore.join(', ')}]`);
    if (missingInBuilder.length) parts.push(`store-only=[${missingInBuilder.join(', ')}]`);
    const builderSettings = serializeStable(builderSnapshot.sceneSettings);
    const storeSettings = serializeStable(storeSnapshot.sceneSettings);
    if (builderSettings !== storeSettings) parts.push('settings-mismatch');
    const builderHash = serializeStable({ elements: builderSnapshot.elements }).slice(0, 120);
    const storeHash = serializeStable({ elements: storeSnapshot.elements }).slice(0, 120);
    if (builderHash !== storeHash) parts.push('elements-differ');
    return parts.length ? parts.join('; ') : 'scene payload mismatch';
}

function emitParityTelemetry(mismatch: SceneParityMismatch) {
    if (!enableSceneParityTelemetry) return;
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('scene-parity-mismatch', {
                    detail: {
                        mode: mismatch.mode,
                        command: mismatch.command,
                        diff: mismatch.diffSummary,
                    },
                })
            );
        }
    } catch (err) {
        console.warn('[scene parity] telemetry dispatch failed', err);
    }
}

function checkParity(
    builder: HybridSceneBuilder,
    builderSnapshot: BuilderSceneSnapshot,
    command: SceneCommand,
    options: SceneCommandOptions | undefined
): { checked: boolean; mismatch?: SceneParityMismatch } {
    const shouldCheck = shouldRunParity(options);
    if (!shouldCheck) {
        return { checked: false };
    }
    const storeSnapshot = useSceneStore.getState().exportSceneDraft();
    const normalizedBuilder: SceneStoreComputedExport = {
        elements: builderSnapshot.elements.map((el, index) => ({ ...el, index: el.index ?? index })),
        sceneSettings: { ...builderSnapshot.sceneSettings },
        macros: normalizeMacrosPayload(builderSnapshot.macros as SceneSerializedMacros | undefined),
    };
    const normalizedStore: SceneStoreComputedExport = {
        elements: storeSnapshot.elements.map((el, index) => ({ ...el, index: el.index ?? index })),
        sceneSettings: { ...storeSnapshot.sceneSettings },
        macros: normalizeMacrosPayload(storeSnapshot.macros),
    };
    const builderJSON = serializeStable(normalizedBuilder);
    const storeJSON = serializeStable(normalizedStore);
    if (builderJSON === storeJSON) {
        return { checked: true };
    }
    const mismatch: SceneParityMismatch = {
        mode: sceneParityMode,
        command,
        diffSummary: summarizeDiff(normalizedBuilder, normalizedStore),
        storeSnapshot: normalizedStore,
        builderSnapshot,
        debug: snapshotBuilder(builder),
    };
    console.error('[scene parity] mismatch', mismatch.diffSummary, { command, mismatch });
    emitParityTelemetry(mismatch);
    return { checked: true, mismatch };
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

function applyLegacySideEffects(store: SceneStoreState, command: SceneCommand) {
    switch (command.type) {
        case 'clearScene': {
            if (command.clearMacros === false) {
                const macros = createMacroPayload(store);
                if (macros) {
                    globalMacroManager.importMacros(macros);
                } else {
                    globalMacroManager.clearMacros();
                }
            } else {
                globalMacroManager.clearMacros();
            }
            break;
        }
        case 'loadSerializedScene': {
            const snapshot = createMacroPayload(store);
            if (snapshot) {
                globalMacroManager.importMacros(snapshot);
            } else {
                globalMacroManager.clearMacros();
            }
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
        case 'importMacros': {
            const payload = command.payload;
            if (payload && payload.macros && Object.keys(payload.macros).length > 0) {
                globalMacroManager.importMacros(payload);
            } else {
                globalMacroManager.clearMacros();
            }
            break;
        }
        default:
            break;
    }
}

export function dispatchSceneCommand(
    builder: HybridSceneBuilder | null | undefined,
    command: SceneCommand,
    options?: SceneCommandOptions
): SceneCommandResult {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const store = useSceneStore.getState();

    try {
        applyStoreCommand(store, command);
    } catch (error) {
        const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            success: false,
            durationMs,
            command,
            parityChecked: false,
            error: err,
        };
    }

    try {
        applyLegacySideEffects(store, command);
    } catch (error) {
        console.warn('[scene command] legacy side effects failed', error);
    }

    let parityChecked = false;
    let parityMismatch: SceneParityMismatch | null | undefined = null;

    if (builder && enableSceneStoreDualWrite) {
        let mutationResult: BuilderMutationResult;
        try {
            mutationResult = runBuilderMutation(builder, command);
        } catch (error) {
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
            const err = error instanceof Error ? error : new Error(String(error));
            return {
                success: false,
                durationMs,
                command,
                parityChecked: false,
                error: err,
            };
        }

        if (!mutationResult.ok) {
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
            return {
                success: false,
                durationMs,
                command,
                parityChecked: false,
                error: mutationResult.message ? new Error(mutationResult.message) : undefined,
            };
        }

        const snapshot = builder.serializeScene();
        const parity = checkParity(builder, snapshot, command, options);
        parityChecked = parity.checked;
        parityMismatch = parity.mismatch;
        if (parityMismatch && sceneParityMode === 'strict' && !options?.skipParity) {
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
            const error = new Error(`Scene parity mismatch (${parityMismatch.diffSummary})`);
            error.name = 'SceneParityError';
            return {
                success: false,
                durationMs,
                command,
                parityChecked,
                parityMismatch,
                error,
            };
        }
    }

    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    return {
        success: true,
        durationMs,
        command,
        parityChecked,
        parityMismatch: parityMismatch ?? null,
    };
}

export function synchronizeSceneStoreFromBuilder(
    builder: HybridSceneBuilder,
    options?: SceneCommandOptions
): SceneCommandResult {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const snapshot = builder.serializeScene();
    const store = useSceneStore.getState();
    store.importScene({
        elements: snapshot.elements,
        sceneSettings: snapshot.sceneSettings,
        macros: snapshot.macros,
    });
    try {
        applyLegacySideEffects(store, { type: 'loadSerializedScene', payload: snapshot });
    } catch (error) {
        console.warn('[scene sync] legacy side effects failed', error);
    }
    const parity = checkParity(builder, snapshot, { type: 'loadSerializedScene', payload: snapshot }, options);
    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    if (parity.mismatch && sceneParityMode === 'strict' && !options?.skipParity) {
        const error = new Error(`Scene parity mismatch (${parity.mismatch.diffSummary})`);
        error.name = 'SceneParityError';
        return {
            success: false,
            durationMs,
            command: { type: 'loadSerializedScene', payload: snapshot },
            parityChecked: parity.checked,
            parityMismatch: parity.mismatch,
            error,
        };
    }
    return {
        success: true,
        durationMs,
        command: { type: 'loadSerializedScene', payload: snapshot },
        parityChecked: parity.checked,
        parityMismatch: parity.mismatch ?? null,
    };
}
