import { HybridSceneBuilder } from '@core/scene-builder';
import { globalMacroManager } from '@bindings/macro-manager';
import { serializeStable } from '@persistence/stable-stringify';
import type { Macro } from '@bindings/macro-manager';
import {
    useSceneStore,
    type ElementBindings,
    type ElementBindingsPatch,
    type SceneImportPayload,
    type SceneMacroDefinition,
    type SceneSerializedElement,
    type SceneSerializedMacros,
    type SceneStoreComputedExport,
    type SceneStoreState,
} from '@state/sceneStore';
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

function toElementBindings(serialized: SceneSerializedElement): ElementBindings {
    const bindings: ElementBindings = {};
    for (const [key, value] of Object.entries(serialized)) {
        if (key === 'id' || key === 'type' || key === 'index') continue;
        if (!value || typeof value !== 'object') continue;
        const candidate = value as any;
        if (candidate.type === 'constant') {
            bindings[key] = { type: 'constant', value: candidate.value };
        } else if (candidate.type === 'macro' && typeof candidate.macroId === 'string') {
            bindings[key] = { type: 'macro', macroId: candidate.macroId };
        }
    }
    return bindings;
}

function buildBindingsPatch(target: ElementBindings, previous: ElementBindings): ElementBindingsPatch {
    const patch: ElementBindingsPatch = {};
    for (const [key, binding] of Object.entries(target)) {
        patch[key] = binding;
    }
    for (const key of Object.keys(previous)) {
        if (!(key in target)) {
            patch[key] = null;
        }
    }
    return patch;
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

function macrosDiffer(a: SceneSerializedMacros | undefined, b: SceneSerializedMacros | undefined | null): boolean {
    const left = a ? serializeStable(a) : 'undefined';
    const right = b ? serializeStable(b) : 'undefined';
    return left !== right;
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

function syncMacrosFromSnapshot(store: SceneStoreState, snapshot: BuilderSceneSnapshot | null) {
    if (!snapshot) return;
    const nextMacros = snapshot.macros ?? undefined;
    const current = createMacroPayload(store);
    if (macrosDiffer(current, nextMacros)) {
        store.replaceMacros(nextMacros);
    }
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

function applyStoreMutation(
    store: SceneStoreState,
    command: SceneCommand,
    snapshotProvider: () => BuilderSceneSnapshot
) {
    switch (command.type) {
        case 'addElement': {
            const snapshot = snapshotProvider();
            const index = snapshot.elements.findIndex((el) => el.id === command.elementId);
            if (index === -1) {
                throw new Error(`Scene command addElement: element '${command.elementId}' missing in builder snapshot`);
            }
            const serialized = snapshot.elements[index];
            store.addElement({
                id: serialized.id,
                type: serialized.type,
                index,
                bindings: toElementBindings(serialized),
                createdBy: command.elementType,
            });
            break;
        }
        case 'removeElement':
            store.removeElement(command.elementId);
            break;
        case 'updateElementConfig': {
            const snapshot = snapshotProvider();
            const serialized = snapshot.elements.find((el) => el.id === command.elementId);
            if (!serialized) {
                throw new Error(`Scene command updateElementConfig: element '${command.elementId}' missing after mutation`);
            }
            const state = useSceneStore.getState();
            const previous = state.bindings.byElement[command.elementId] ?? {};
            const patch = buildBindingsPatch(toElementBindings(serialized), previous);
            store.updateBindings(command.elementId, patch);
            break;
        }
        case 'moveElement': {
            const snapshot = snapshotProvider();
            const index = snapshot.elements.findIndex((el) => el.id === command.elementId);
            if (index >= 0) {
                store.moveElement(command.elementId, index);
            }
            break;
        }
        case 'duplicateElement': {
            store.duplicateElement(command.sourceId, command.newId, { insertAfter: command.insertAfter ?? false });
            const snapshot = snapshotProvider();
            const targetIndex = snapshot.elements.findIndex((el) => el.id === command.newId);
            if (targetIndex >= 0) {
                store.moveElement(command.newId, targetIndex);
            }
            break;
        }
        case 'updateElementId':
            store.updateElementId(command.currentId, command.nextId);
            break;
        case 'clearScene':
            store.clearScene();
            break;
        case 'resetSceneSettings': {
            const snapshot = snapshotProvider();
            store.updateSettings(snapshot.sceneSettings);
            break;
        }
        case 'updateSceneSettings': {
            const snapshot = snapshotProvider();
            store.updateSettings(snapshot.sceneSettings);
            break;
        }
        case 'loadSerializedScene': {
            store.importScene(command.payload);
            break;
        }
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

export function dispatchSceneCommand(
    builder: HybridSceneBuilder,
    command: SceneCommand,
    options?: SceneCommandOptions
): SceneCommandResult {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
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

    let builderSnapshot: BuilderSceneSnapshot | null = null;
    const snapshotProvider = () => {
        if (!builderSnapshot) {
            builderSnapshot = builder.serializeScene();
        }
        return builderSnapshot;
    };

    let parityChecked = false;
    let parityMismatch: SceneParityMismatch | null | undefined;

    if (enableSceneStoreDualWrite) {
        const store = useSceneStore.getState();
        applyStoreMutation(store, command, snapshotProvider);
        const snapshot = snapshotProvider();
        syncMacrosFromSnapshot(store, snapshot);
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
