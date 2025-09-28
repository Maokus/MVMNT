import { globalMacroManager, type Macro, type MacroManager } from '@bindings/macro-manager';
import { useSceneStore } from '@state/sceneStore';
import type { SceneMacroState, SceneSerializedMacros } from '@state/sceneStore';

export type MacroEvent =
    | { type: 'macroCreated'; macro: Macro }
    | { type: 'macroDeleted'; macroId: string; previous: Macro }
    | { type: 'macroValueChanged'; macroId: string; value: unknown; previousValue: unknown }
    | { type: 'macrosImported'; payload: SceneSerializedMacros | null };

export type MacroEventListener = (event: MacroEvent) => void;

let currentSnapshot: SceneMacroState | null = null;
let unsubscribeFromStore: (() => void) | null = null;
const listeners = new Set<MacroEventListener>();

function cloneMacroState(state: SceneMacroState): SceneMacroState {
    return {
        byId: { ...state.byId },
        allIds: [...state.allIds],
        exportedAt: state.exportedAt,
    };
}

function buildSerializedPayload(state: SceneMacroState): SceneSerializedMacros | null {
    if (state.allIds.length === 0) {
        return null;
    }
    const macros: Record<string, Macro> = {};
    for (const id of state.allIds) {
        const macro = state.byId[id];
        if (!macro) continue;
        macros[id] = { ...macro, options: { ...(macro.options ?? {}) } };
    }
    return {
        macros,
        exportedAt: state.exportedAt ?? Date.now(),
    };
}

function mirrorLegacyManager(state: SceneMacroState) {
    const payload = buildSerializedPayload(state);
    if (!payload) {
        globalMacroManager.clearMacros();
        return;
    }
    globalMacroManager.importMacros(payload);
}

function emit(event: MacroEvent) {
    listeners.forEach((listener) => {
        try {
            listener(event);
        } catch (error) {
            console.warn('[macroSync] listener failed', error);
        }
    });
}

function diffAndEmit(next: SceneMacroState, prev: SceneMacroState | null) {
    if (!prev) {
        emit({ type: 'macrosImported', payload: buildSerializedPayload(next) });
        return;
    }

    const prevSet = new Set(prev.allIds);
    const nextSet = new Set(next.allIds);

    for (const id of nextSet) {
        const macro = next.byId[id];
        const previous = prev.byId[id];
        if (!previous && macro) {
            emit({ type: 'macroCreated', macro });
        } else if (macro && previous && !Object.is(previous.value, macro.value)) {
            emit({ type: 'macroValueChanged', macroId: id, value: macro.value, previousValue: previous.value });
        }
    }

    for (const id of prevSet) {
        const previous = prev.byId[id];
        if (!next.byId[id] && previous) {
            emit({ type: 'macroDeleted', macroId: id, previous });
        }
    }

    const payloadChanged = (prev.exportedAt ?? null) !== (next.exportedAt ?? null);
    if (payloadChanged || prev.allIds.length !== next.allIds.length) {
        emit({ type: 'macrosImported', payload: buildSerializedPayload(next) });
    }
}

function ensureSubscription() {
    if (unsubscribeFromStore) return;
    currentSnapshot = cloneMacroState(useSceneStore.getState().macros);
    mirrorLegacyManager(currentSnapshot);

    unsubscribeFromStore = useSceneStore.subscribe(
        (state) => state.macros,
        (next) => {
            const prev = currentSnapshot;
            currentSnapshot = cloneMacroState(next);
            mirrorLegacyManager(next);
            diffAndEmit(next, prev);
        },
        { equalityFn: Object.is }
    );
}

export function ensureMacroSync() {
    ensureSubscription();
}

export function stopMacroSync() {
    if (unsubscribeFromStore) {
        unsubscribeFromStore();
        unsubscribeFromStore = null;
    }
    currentSnapshot = null;
}

export function subscribeToMacroEvents(listener: MacroEventListener): () => void {
    ensureSubscription();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getMacroById(macroId: string): Macro | undefined {
    ensureSubscription();
    return useSceneStore.getState().macros.byId[macroId];
}

export function getMacroValue(macroId: string): unknown {
    return getMacroById(macroId)?.value;
}

export function updateMacroValue(macroId: string, value: unknown) {
    ensureSubscription();
    const store = useSceneStore.getState();
    store.updateMacroValue(macroId, value);
}

export function getLegacyMacroManager(): MacroManager {
    ensureSubscription();
    return globalMacroManager;
}

export function getMacroSnapshot(): SceneSerializedMacros | null {
    ensureSubscription();
    const state = useSceneStore.getState().macros;
    return buildSerializedPayload(state);
}

export function replaceMacrosFromSnapshot(payload: SceneSerializedMacros | null | undefined) {
    ensureSubscription();
    useSceneStore.getState().replaceMacros(payload);
}
