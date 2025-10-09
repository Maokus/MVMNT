import { create, type StateCreator } from 'zustand';
import type { Macro } from '@state/scene/macros';
import type { PropertyBindingData } from '@bindings/property-bindings';
import type { FontAsset } from '@state/scene/fonts';

export type BindingState = ConstantBindingState | MacroBindingState | AudioFeatureBindingState;

export interface ConstantBindingState {
    type: 'constant';
    value: unknown;
}

export interface MacroBindingState {
    type: 'macro';
    macroId: string;
}

export interface AudioFeatureBindingState {
    type: 'audioFeature';
    trackId: string;
    featureKey: string;
    calculatorId?: string;
    bandIndex?: number | null;
    channelIndex?: number | null;
    smoothing?: number | null;
}

export type ElementBindings = Record<string, BindingState>;

export interface MacroBindingAssignment {
    elementId: string;
    propertyPath: string;
}

export type MacroBindingsIndex = Record<string, MacroBindingAssignment[]>;

export interface SceneSettingsState {
    fps: number;
    width: number;
    height: number;
    tempo: number;
    beatsPerBar: number;
    [key: string]: unknown;
}

export interface SceneElementRecord {
    id: string;
    type: string;
    createdAt: number;
    createdBy?: string;
}

export interface SceneInteractionState {
    selectedElementIds: string[];
    hoveredElementId: string | null;
    editingElementId: string | null;
    clipboard: SceneClipboard | null;
}

export interface SceneClipboard {
    exportedAt: number;
    elementIds: string[];
}

export interface SceneMacroState {
    byId: Record<string, Macro>;
    allIds: string[];
    exportedAt?: number;
}

export interface SceneRuntimeMeta {
    schemaVersion: number;
    initializedAt: number;
    lastHydratedAt?: number;
    lastMutationSource?: SceneMutationSource;
    lastMutatedAt?: number;
    persistentDirty: boolean;
    hasInitializedScene: boolean;
}

export type SceneMutationSource =
    | 'addElement'
    | 'moveElement'
    | 'duplicateElement'
    | 'removeElement'
    | 'updateElementId'
    | 'updateBindings'
    | 'updateSettings'
    | 'updateMacros'
    | 'updateFonts'
    | 'clearScene'
    | 'importScene';

export interface SceneBindingsState {
    byElement: Record<string, ElementBindings>;
    byMacro: MacroBindingsIndex;
}

export interface SceneFontsState {
    assets: Record<string, FontAsset>;
    order: string[];
    totalBytes: number;
    licensingAcknowledgedAt?: number;
}

export interface SceneStoreComputedExport {
    elements: SceneSerializedElement[];
    sceneSettings: SceneSettingsState;
    macros?: SceneSerializedMacros;
    fontAssets?: Record<string, FontAsset>;
    fontLicensingAcknowledgedAt?: number;
}

export interface SceneSerializedElement {
    id: string;
    type: string;
    index?: number;
    [key: string]: unknown;
}

export interface SceneSerializedMacros {
    macros: Record<string, Macro>;
    exportedAt?: number;
}

export interface SceneMacroDefinition {
    type: Macro['type'];
    value: unknown;
    defaultValue?: unknown;
    options?: Macro['options'];
}

export interface SceneImportPayload {
    elements?: SceneSerializedElement[];
    sceneSettings?: Partial<SceneSettingsState> | null;
    macros?: SceneSerializedMacros | null;
    fontAssets?: Record<string, FontAsset> | null;
    fontLicensingAcknowledgedAt?: number | null;
}

export interface SceneElementInput {
    id: string;
    type: string;
    index?: number;
    createdBy?: string;
    createdAt?: number;
    bindings?: ElementBindings;
}

export type ElementBindingsPatch = Record<string, BindingState | null | undefined>;

export interface SceneStoreActions {
    addElement: (input: SceneElementInput) => void;
    moveElement: (elementId: string, targetIndex: number) => void;
    duplicateElement: (sourceId: string, newId: string, opts?: { insertAfter?: boolean }) => void;
    removeElement: (elementId: string) => void;
    updateElementId: (currentId: string, nextId: string) => void;
    updateSettings: (patch: Partial<SceneSettingsState>) => void;
    updateBindings: (elementId: string, patch: ElementBindingsPatch) => void;
    createMacro: (macroId: string, definition: SceneMacroDefinition) => void;
    updateMacroValue: (macroId: string, value: unknown) => void;
    renameMacro: (currentId: string, nextId: string) => void;
    deleteMacro: (macroId: string) => void;
    registerFontAsset: (asset: FontAsset) => void;
    updateFontAsset: (assetId: string, patch: Partial<Omit<FontAsset, 'id'>>) => void;
    deleteFontAsset: (assetId: string) => void;
    acknowledgeFontLicensing: (timestamp?: number) => void;
    clearScene: () => void;
    importScene: (payload: SceneImportPayload) => void;
    exportSceneDraft: () => SceneStoreComputedExport;
    replaceMacros: (payload: SceneSerializedMacros | null | undefined) => void;
    setInteractionState: (patch: Partial<SceneInteractionState>) => void;
}

export interface SceneStoreState extends SceneStoreActions {
    settings: SceneSettingsState;
    elements: Record<string, SceneElementRecord>;
    order: string[];
    bindings: SceneBindingsState;
    macros: SceneMacroState;
    fonts: SceneFontsState;
    interaction: SceneInteractionState;
    runtimeMeta: SceneRuntimeMeta;
}

const SCENE_SCHEMA_VERSION = 1;

export const DEFAULT_SCENE_SETTINGS: SceneSettingsState = {
    fps: 60,
    width: 1500,
    height: 1500,
    tempo: 120,
    beatsPerBar: 4,
};

function createInitialInteractionState(): SceneInteractionState {
    return {
        selectedElementIds: [],
        hoveredElementId: null,
        editingElementId: null,
        clipboard: null,
    };
}

function createEmptyBindingsState(): SceneBindingsState {
    return { byElement: {}, byMacro: {} };
}

function cloneBinding(binding: BindingState): BindingState {
    if (binding.type === 'constant') {
        return { type: 'constant', value: binding.value };
    }
    if (binding.type === 'macro') {
        return { type: 'macro', macroId: binding.macroId };
    }
    return {
        type: 'audioFeature',
        trackId: binding.trackId,
        featureKey: binding.featureKey,
        calculatorId: binding.calculatorId,
        bandIndex: binding.bandIndex ?? null,
        channelIndex: binding.channelIndex ?? null,
        smoothing: binding.smoothing ?? null,
    };
}

function cloneBindingsMap(bindings: ElementBindings): ElementBindings {
    const result: ElementBindings = {};
    for (const [key, binding] of Object.entries(bindings)) {
        result[key] = cloneBinding(binding);
    }
    return result;
}

function cloneFontAsset(asset: FontAsset): FontAsset {
    return {
        ...asset,
        variants: Array.isArray(asset.variants)
            ? asset.variants.map((variant) => ({
                  ...variant,
                  variationSettings: variant.variationSettings ? { ...variant.variationSettings } : undefined,
              }))
            : [],
    };
}

function computeFontBytes(assets: Record<string, FontAsset>): number {
    return Object.values(assets).reduce((total, asset) => {
        if (!asset) return total;
        const size = typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : 0;
        return total + size;
    }, 0);
}

function normalizeFontAssetInput(input: FontAsset, existing?: FontAsset): FontAsset {
    const now = Date.now();
    const createdAt = existing?.createdAt ?? input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    const licensingAcknowledged =
        typeof input.licensingAcknowledged === 'boolean'
            ? input.licensingAcknowledged
            : existing?.licensingAcknowledged ?? false;
    return cloneFontAsset({
        ...existing,
        ...input,
        createdAt,
        updatedAt,
        licensingAcknowledged,
    });
}

function rebuildMacroIndex(byElement: Record<string, ElementBindings>): MacroBindingsIndex {
    const byMacro: MacroBindingsIndex = {};
    for (const [elementId, bindings] of Object.entries(byElement)) {
        for (const [propertyPath, binding] of Object.entries(bindings)) {
            if (binding.type !== 'macro') continue;
            if (!byMacro[binding.macroId]) byMacro[binding.macroId] = [];
            byMacro[binding.macroId].push({ elementId, propertyPath });
        }
    }
    for (const assignments of Object.values(byMacro)) {
        assignments.sort((a, b) => {
            if (a.elementId === b.elementId) return a.propertyPath.localeCompare(b.propertyPath);
            return a.elementId.localeCompare(b.elementId);
        });
    }
    return byMacro;
}

function normalizeSelection(state: SceneStoreState, ids: string[] | null | undefined): string[] {
    if (!ids || ids.length === 0) return [];
    const next: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
        if (typeof raw !== 'string') continue;
        if (!state.elements[raw]) continue;
        if (seen.has(raw)) continue;
        next.push(raw);
        seen.add(raw);
    }
    return next;
}

function selectionEquals(a: string[], b: string[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function bindingEquals(a: BindingState, b: BindingState): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'constant' && b.type === 'constant') return Object.is(a.value, b.value);
    if (a.type === 'macro' && b.type === 'macro') return a.macroId === b.macroId;
    if (a.type === 'audioFeature' && b.type === 'audioFeature') {
        return (
            a.trackId === b.trackId &&
            a.featureKey === b.featureKey &&
            (a.calculatorId ?? null) === (b.calculatorId ?? null) &&
            (a.bandIndex ?? null) === (b.bandIndex ?? null) &&
            (a.channelIndex ?? null) === (b.channelIndex ?? null) &&
            (a.smoothing ?? null) === (b.smoothing ?? null)
        );
    }
    return false;
}

export function deserializeElementBindings(raw: SceneSerializedElement): ElementBindings {
    const bindings: ElementBindings = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key === 'id' || key === 'type' || key === 'index') continue;
        if (!value || typeof value !== 'object') continue;
        const payload = value as PropertyBindingData;
        if (payload.type === 'constant') {
            bindings[key] = { type: 'constant', value: payload.value };
        } else if (payload.type === 'macro' && typeof payload.macroId === 'string') {
            bindings[key] = { type: 'macro', macroId: payload.macroId };
        } else if (payload.type === 'audioFeature') {
            bindings[key] = {
                type: 'audioFeature',
                trackId: payload.trackId,
                featureKey: payload.featureKey,
                calculatorId: payload.calculatorId,
                bandIndex: payload.bandIndex ?? null,
                channelIndex: payload.channelIndex ?? null,
                smoothing: payload.smoothing ?? null,
            };
        }
    }
    return bindings;
}

function serializeElement(
    element: SceneElementRecord,
    bindings: ElementBindings,
    index: number
): SceneSerializedElement {
    const serialized: SceneSerializedElement = {
        id: element.id,
        type: element.type,
        index,
    };
    for (const [key, binding] of Object.entries(bindings)) {
        if (binding.type === 'constant') {
            serialized[key] = { type: 'constant', value: binding.value } satisfies PropertyBindingData;
        } else if (binding.type === 'macro') {
            serialized[key] = { type: 'macro', macroId: binding.macroId } satisfies PropertyBindingData;
        } else {
            serialized[key] = {
                type: 'audioFeature',
                trackId: binding.trackId,
                featureKey: binding.featureKey,
                calculatorId: binding.calculatorId,
                bandIndex: binding.bandIndex ?? undefined,
                channelIndex: binding.channelIndex ?? undefined,
                smoothing: binding.smoothing ?? undefined,
            } satisfies PropertyBindingData;
        }
    }
    return serialized;
}

function createRuntimeMeta(): SceneRuntimeMeta {
    const now = Date.now();
    return {
        schemaVersion: SCENE_SCHEMA_VERSION,
        initializedAt: now,
        lastMutatedAt: now,
        persistentDirty: false,
        hasInitializedScene: false,
    };
}

function markDirty(prev: SceneStoreState, source: SceneMutationSource): SceneRuntimeMeta {
    const now = Date.now();
    return {
        ...prev.runtimeMeta,
        persistentDirty: true,
        lastMutationSource: source,
        lastMutatedAt: now,
        hasInitializedScene: true,
    };
}

function buildMacroState(payload?: SceneSerializedMacros | null): SceneMacroState {
    if (!payload || !payload.macros) return { byId: {}, allIds: [], exportedAt: undefined };
    const macroIds = Object.keys(payload.macros);
    const byId: Record<string, Macro> = {};
    for (const id of macroIds) {
        const macro = payload.macros[id];
        byId[id] = {
            ...macro,
            options: cloneMacroOptions(macro?.options),
        };
    }
    const hasMacros = macroIds.length > 0;
    const exportedAt = hasMacros
        ? typeof payload.exportedAt === 'number'
            ? payload.exportedAt
            : Date.now()
        : undefined;
    return { byId, allIds: macroIds, exportedAt };
}

function buildMacroPayload(state: SceneMacroState): SceneSerializedMacros | undefined {
    if (state.allIds.length === 0) return undefined;
    const macros: Record<string, Macro> = {};
    for (const id of state.allIds) {
        const macro = state.byId[id];
        if (macro) macros[id] = { ...macro };
    }
    const payload: SceneSerializedMacros = { macros };
    if (typeof state.exportedAt === 'number') payload.exportedAt = state.exportedAt;
    return payload;
}

function cloneMacroOptions(source?: Macro['options']): Macro['options'] {
    if (!source) return {} as Macro['options'];
    const next: Macro['options'] = { ...source };
    if (Array.isArray(source.selectOptions)) {
        next.selectOptions = source.selectOptions.map((entry) => ({ ...entry }));
    }
    return next;
}

function validateMacroValue(
    type: Macro['type'],
    value: unknown,
    options: Macro['options'] = {} as Macro['options']
): boolean {
    switch (type) {
        case 'number':
            if (typeof value !== 'number' || Number.isNaN(value)) return false;
            if (typeof options.min === 'number' && value < options.min) return false;
            if (typeof options.max === 'number' && value > options.max) return false;
            return true;
        case 'string':
            return typeof value === 'string';
        case 'boolean':
            return typeof value === 'boolean';
        case 'color':
            return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(value);
        case 'font':
            if (typeof value !== 'string') return false;
            if (value.trim() === '') return true;
            const parts = value.split('|');
            if (parts.length === 1) return true;
            if (parts.length === 2) {
                return /^(?:100|200|300|400|500|600|700|800|900)$/.test(parts[1]);
            }
            return false;
        case 'select':
            if (!Array.isArray(options.selectOptions) || options.selectOptions.length === 0) return true;
            return options.selectOptions.some((opt) => opt.value === value);
        case 'file':
            if (value === null || value === undefined) return true;
            if (typeof File === 'undefined') return true;
            return value instanceof File;
        case 'timelineTrackRef':
            if (value == null) return true;
            if (typeof value === 'string') return true;
            if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string');
            return false;
        default:
            return true;
    }
}

function normalizeIndex(targetIndex: number, size: number): number {
    if (!Number.isFinite(targetIndex)) return size;
    if (targetIndex < 0) return 0;
    if (targetIndex > size) return size;
    return Math.floor(targetIndex);
}

function readZIndexValue(binding: BindingState | undefined): number | null {
    if (!binding || binding.type !== 'constant') return null;
    const value = typeof binding.value === 'number' ? binding.value : Number(binding.value);
    return Number.isFinite(value) ? value : null;
}

function sortElementIdsByZIndex(order: string[], byElement: Record<string, ElementBindings>): string[] {
    const enriched = order.map((id, index) => ({
        id,
        z: readZIndexValue(byElement[id]?.zIndex) ?? Number.NEGATIVE_INFINITY,
        index,
    }));

    enriched.sort((a, b) => {
        if (a.z === b.z) return a.index - b.index;
        return b.z - a.z;
    });

    return enriched.map((entry) => entry.id);
}

function ordersEqual(a: string[], b: string[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

const createSceneStoreState = (
    set: (
        partial: Partial<SceneStoreState> | ((state: SceneStoreState) => Partial<SceneStoreState>),
        replace?: boolean
    ) => void,
    get: () => SceneStoreState
): SceneStoreState => ({
    settings: { ...DEFAULT_SCENE_SETTINGS },
    elements: {},
    order: [],
    bindings: createEmptyBindingsState(),
    macros: { byId: {}, allIds: [], exportedAt: undefined },
    fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
    interaction: createInitialInteractionState(),
    runtimeMeta: createRuntimeMeta(),

    addElement: (input) => {
        set((state) => {
            if (!input.id) throw new Error('SceneStore.addElement: id is required');
            if (state.elements[input.id])
                throw new Error(`SceneStore.addElement: element '${input.id}' already exists`);

            const element: SceneElementRecord = {
                id: input.id,
                type: input.type,
                createdAt: input.createdAt ?? Date.now(),
                createdBy: input.createdBy,
            };

            const nextElements = { ...state.elements, [element.id]: element };
            const nextOrder = [...state.order];
            const insertionIndex = normalizeIndex(input.index ?? nextOrder.length, nextOrder.length);
            nextOrder.splice(insertionIndex, 0, element.id);

            const initialBindings = cloneBindingsMap(input.bindings ?? {});
            const nextByElement = { ...state.bindings.byElement, [element.id]: initialBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            return {
                ...state,
                elements: nextElements,
                order: nextOrder,
                bindings: nextBindings,
                runtimeMeta: markDirty(state, 'addElement'),
            };
        });
    },

    moveElement: (elementId, targetIndex) => {
        set((state) => {
            const currentIndex = state.order.indexOf(elementId);
            if (currentIndex === -1) return state;

            const boundedIndex = normalizeIndex(targetIndex, state.order.length - 1);
            if (currentIndex === boundedIndex) return state;

            const nextOrder = [...state.order];
            nextOrder.splice(currentIndex, 1);
            nextOrder.splice(boundedIndex, 0, elementId);

            const total = nextOrder.length;
            let nextByElement: Record<string, ElementBindings> | null = null;
            let bindingsMutated = false;

            for (let index = 0; index < nextOrder.length; index += 1) {
                const id = nextOrder[index];
                const desiredZ = total - index - 1;
                const sourceMap = nextByElement ?? state.bindings.byElement;
                const existingBindings = sourceMap[id] ?? {};
                const current = existingBindings.zIndex;
                const currentValue = readZIndexValue(current);
                if (current?.type === 'constant' && currentValue === desiredZ) {
                    continue;
                }

                if (!nextByElement) {
                    nextByElement = { ...state.bindings.byElement };
                }

                const nextZBinding: ConstantBindingState = { type: 'constant', value: desiredZ };
                const updatedBindings: ElementBindings = { ...existingBindings, zIndex: nextZBinding };
                nextByElement[id] = updatedBindings;
                bindingsMutated = true;
            }

            const bindingsState = bindingsMutated
                ? {
                      byElement: nextByElement!,
                      byMacro: rebuildMacroIndex(nextByElement!),
                  }
                : state.bindings;

            return {
                ...state,
                order: nextOrder,
                bindings: bindingsState,
                runtimeMeta: markDirty(state, 'moveElement'),
            };
        });
    },

    duplicateElement: (sourceId, newId, opts) => {
        set((state) => {
            if (!state.elements[sourceId])
                throw new Error(`SceneStore.duplicateElement: source '${sourceId}' not found`);
            if (state.elements[newId])
                throw new Error(`SceneStore.duplicateElement: element '${newId}' already exists`);

            const source = state.elements[sourceId];
            const clonedBindings = cloneBindingsMap(state.bindings.byElement[sourceId] ?? {});

            const insertAfter = opts?.insertAfter ?? true;
            const sourceIndex = state.order.indexOf(sourceId);
            const insertionIndex = insertAfter ? sourceIndex + 1 : state.order.length;

            const element: SceneElementRecord = {
                id: newId,
                type: source.type,
                createdAt: Date.now(),
                createdBy: 'duplicate',
            };

            const nextElements = { ...state.elements, [element.id]: element };
            const nextOrder = [...state.order];
            const boundedIndex = normalizeIndex(insertionIndex, nextOrder.length);
            nextOrder.splice(boundedIndex, 0, element.id);

            const nextByElement = { ...state.bindings.byElement, [element.id]: clonedBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            return {
                ...state,
                elements: nextElements,
                order: nextOrder,
                bindings: nextBindings,
                runtimeMeta: markDirty(state, 'duplicateElement'),
            };
        });
    },

    removeElement: (elementId) => {
        set((state) => {
            if (!state.elements[elementId]) return state;

            const { [elementId]: _removedElement, ...remaining } = state.elements;
            const nextOrder = state.order.filter((id) => id !== elementId);
            const { [elementId]: _removedBindings, ...remainingBindings } = state.bindings.byElement;
            const nextBindings: SceneBindingsState = {
                byElement: remainingBindings,
                byMacro: rebuildMacroIndex(remainingBindings),
            };

            return {
                ...state,
                elements: remaining,
                order: nextOrder,
                bindings: nextBindings,
                interaction: {
                    ...state.interaction,
                    selectedElementIds: state.interaction.selectedElementIds.filter((id) => id !== elementId),
                    hoveredElementId:
                        state.interaction.hoveredElementId === elementId ? null : state.interaction.hoveredElementId,
                    editingElementId:
                        state.interaction.editingElementId === elementId ? null : state.interaction.editingElementId,
                },
                runtimeMeta: markDirty(state, 'removeElement'),
            };
        });
    },

    updateElementId: (currentId, nextId) => {
        set((state) => {
            if (!state.elements[currentId]) return state;
            if (currentId === nextId) return state;
            if (state.elements[nextId]) {
                throw new Error(`SceneStore.updateElementId: element '${nextId}' already exists`);
            }

            const element = state.elements[currentId];
            const updatedElement: SceneElementRecord = {
                ...element,
                id: nextId,
            };

            const { [currentId]: _existing, ...remainingElements } = state.elements;
            const nextElements = { ...remainingElements, [nextId]: updatedElement };

            const nextOrder = state.order.map((id) => (id === currentId ? nextId : id));

            const existingBindings = state.bindings.byElement[currentId] ?? {};
            const { [currentId]: _removedBindingState, ...remainingBindings } = state.bindings.byElement;
            const nextByElement = { ...remainingBindings, [nextId]: existingBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            const nextInteraction: SceneInteractionState = {
                ...state.interaction,
                selectedElementIds: state.interaction.selectedElementIds.map((id) => (id === currentId ? nextId : id)),
                hoveredElementId:
                    state.interaction.hoveredElementId === currentId ? nextId : state.interaction.hoveredElementId,
                editingElementId:
                    state.interaction.editingElementId === currentId ? nextId : state.interaction.editingElementId,
            };

            return {
                ...state,
                elements: nextElements,
                order: nextOrder,
                bindings: nextBindings,
                interaction: nextInteraction,
                runtimeMeta: markDirty(state, 'updateElementId'),
            };
        });
    },

    updateSettings: (patch) => {
        set((state) => ({
            ...state,
            settings: { ...state.settings, ...patch },
            runtimeMeta: markDirty(state, 'updateSettings'),
        }));
    },

    updateBindings: (elementId, patch) => {
        set((state) => {
            const existing = state.bindings.byElement[elementId];
            if (!existing) throw new Error(`SceneStore.updateBindings: element '${elementId}' not found`);

            let changed = false;
            let zIndexChanged = false;
            const nextBindingsForElement: ElementBindings = { ...existing };

            for (const [key, binding] of Object.entries(patch)) {
                if (binding == null) {
                    if (key in nextBindingsForElement) {
                        delete nextBindingsForElement[key];
                        changed = true;
                        if (key === 'zIndex') {
                            zIndexChanged = true;
                        }
                    }
                    continue;
                }

                let normalized: BindingState;
                if (binding.type === 'constant') {
                    normalized = { type: 'constant', value: binding.value };
                } else if (binding.type === 'macro') {
                    normalized = { type: 'macro', macroId: binding.macroId };
                } else {
                    normalized = {
                        type: 'audioFeature',
                        trackId: binding.trackId,
                        featureKey: binding.featureKey,
                        calculatorId: binding.calculatorId,
                        bandIndex: binding.bandIndex ?? null,
                        channelIndex: binding.channelIndex ?? null,
                        smoothing: binding.smoothing ?? null,
                    };
                }

                const current = nextBindingsForElement[key];
                if (!current || !bindingEquals(current, normalized)) {
                    nextBindingsForElement[key] = normalized;
                    changed = true;
                    if (key === 'zIndex') {
                        zIndexChanged = true;
                    }
                }
            }

            if (!changed) return state;

            const nextByElement = { ...state.bindings.byElement, [elementId]: nextBindingsForElement };
            const reordered = zIndexChanged ? sortElementIdsByZIndex(state.order, nextByElement) : state.order;

            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            return {
                ...state,
                order: zIndexChanged && !ordersEqual(reordered, state.order) ? reordered : state.order,
                bindings: nextBindings,
                runtimeMeta: markDirty(state, 'updateBindings'),
            };
        });
    },

    createMacro: (macroId, definition) => {
        set((state) => {
            const id = typeof macroId === 'string' ? macroId.trim() : '';
            if (!id) throw new Error('SceneStore.createMacro: macroId is required');
            if (state.macros.byId[id]) {
                throw new Error(`SceneStore.createMacro: macro '${id}' already exists`);
            }

            const options = cloneMacroOptions(definition.options);
            const defaultValue = definition.defaultValue !== undefined ? definition.defaultValue : definition.value;
            if (!validateMacroValue(definition.type, definition.value, options)) {
                throw new Error(`SceneStore.createMacro: invalid value for macro '${id}'`);
            }

            const now = Date.now();
            const macro: Macro = {
                name: id,
                type: definition.type,
                value: definition.value,
                defaultValue,
                options,
                createdAt: now,
                lastModified: now,
            };

            const nextById = { ...state.macros.byId, [id]: macro };
            const nextAllIds = [...state.macros.allIds, id];

            return {
                ...state,
                macros: {
                    byId: nextById,
                    allIds: nextAllIds,
                    exportedAt: now,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    updateMacroValue: (macroId, value) => {
        set((state) => {
            const macro = state.macros.byId[macroId];
            if (!macro) return state;
            if (!validateMacroValue(macro.type, value, macro.options)) {
                throw new Error(`SceneStore.updateMacroValue: invalid value for macro '${macroId}'`);
            }
            if (Object.is(macro.value, value)) return state;

            const now = Date.now();
            const nextMacro: Macro = {
                ...macro,
                value,
                lastModified: now,
            };
            const nextExportedAt = typeof state.macros.exportedAt === 'number' ? state.macros.exportedAt : now;

            return {
                ...state,
                macros: {
                    byId: { ...state.macros.byId, [macroId]: nextMacro },
                    allIds: [...state.macros.allIds],
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    renameMacro: (currentId, nextId) => {
        set((state) => {
            const macro = state.macros.byId[currentId];
            if (!macro) return state;

            const trimmed = typeof nextId === 'string' ? nextId.trim() : '';
            if (!trimmed) {
                throw new Error('SceneStore.renameMacro: nextId is required');
            }
            if (trimmed === currentId) {
                return state;
            }
            if (state.macros.byId[trimmed]) {
                throw new Error(`SceneStore.renameMacro: macro '${trimmed}' already exists`);
            }

            const now = Date.now();
            const renamed: Macro = {
                ...macro,
                name: trimmed,
                lastModified: now,
            };

            const nextById = { ...state.macros.byId };
            delete nextById[currentId];
            nextById[trimmed] = renamed;

            const nextAllIds = state.macros.allIds.map((id) => (id === currentId ? trimmed : id));

            const mutatedBindings: Record<string, ElementBindings> = {};
            let bindingsMutated = false;

            for (const [elementId, bindings] of Object.entries(state.bindings.byElement)) {
                let elementMutated = false;
                const updated: ElementBindings = { ...bindings };

                for (const [property, binding] of Object.entries(bindings)) {
                    if (binding?.type === 'macro' && binding.macroId === currentId) {
                        updated[property] = { type: 'macro', macroId: trimmed };
                        elementMutated = true;
                    }
                }

                if (elementMutated) {
                    mutatedBindings[elementId] = updated;
                    bindingsMutated = true;
                }
            }

            const nextByElement = bindingsMutated
                ? { ...state.bindings.byElement, ...mutatedBindings }
                : state.bindings.byElement;

            const nextBindings: SceneBindingsState = bindingsMutated
                ? {
                      byElement: nextByElement,
                      byMacro: rebuildMacroIndex(nextByElement),
                  }
                : state.bindings;

            const nextExportedAt = typeof state.macros.exportedAt === 'number' ? state.macros.exportedAt : now;

            return {
                ...state,
                bindings: nextBindings,
                macros: {
                    byId: nextById,
                    allIds: nextAllIds,
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    deleteMacro: (macroId) => {
        set((state) => {
            const macro = state.macros.byId[macroId];
            if (!macro) return state;

            const assignments = state.bindings.byMacro[macroId] ?? [];
            const nextByElement: Record<string, ElementBindings> = { ...state.bindings.byElement };
            const mutatedIds = new Set<string>();

            for (const assignment of assignments) {
                const current = nextByElement[assignment.elementId];
                if (!current) continue;
                if (!mutatedIds.has(assignment.elementId)) {
                    nextByElement[assignment.elementId] = { ...current };
                    mutatedIds.add(assignment.elementId);
                }
                const bindings = nextByElement[assignment.elementId];
                const binding = bindings[assignment.propertyPath];
                if (binding && binding.type === 'macro' && binding.macroId === macroId) {
                    bindings[assignment.propertyPath] = { type: 'constant', value: macro.value };
                }
            }

            const bindingsState: SceneBindingsState = mutatedIds.size
                ? {
                      byElement: nextByElement,
                      byMacro: rebuildMacroIndex(nextByElement),
                  }
                : {
                      byElement: state.bindings.byElement,
                      byMacro: rebuildMacroIndex(state.bindings.byElement),
                  };

            const { [macroId]: _removed, ...remainingMacros } = state.macros.byId;
            const nextAllIds = state.macros.allIds.filter((id) => id !== macroId);
            const hasRemaining = nextAllIds.length > 0;
            const nextExportedAt = hasRemaining
                ? typeof state.macros.exportedAt === 'number'
                    ? state.macros.exportedAt
                    : Date.now()
                : undefined;

            return {
                ...state,
                bindings: bindingsState,
                macros: {
                    byId: remainingMacros,
                    allIds: nextAllIds,
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    registerFontAsset: (asset) => {
        set((state) => {
            if (!asset?.id) throw new Error('SceneStore.registerFontAsset: id is required');
            const existing = state.fonts.assets[asset.id];
            const normalized = normalizeFontAssetInput(asset, existing);
            const nextAssets = { ...state.fonts.assets, [asset.id]: normalized };
            const nextOrder = [...state.fonts.order.filter((id) => id !== asset.id), asset.id];
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    order: nextOrder,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    updateFontAsset: (assetId, patch) => {
        set((state) => {
            const existing = state.fonts.assets[assetId];
            if (!existing) return state;
            const merged: FontAsset = normalizeFontAssetInput({ ...existing, ...patch, id: assetId } as FontAsset, existing);
            if (JSON.stringify(existing) === JSON.stringify(merged)) {
                return state;
            }
            const nextAssets = { ...state.fonts.assets, [assetId]: merged };
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    deleteFontAsset: (assetId) => {
        set((state) => {
            if (!state.fonts.assets[assetId]) return state;
            const nextAssets = { ...state.fonts.assets };
            delete nextAssets[assetId];
            const nextOrder = state.fonts.order.filter((id) => id !== assetId);
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    order: nextOrder,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    acknowledgeFontLicensing: (timestamp) => {
        set((state) => {
            const resolved = typeof timestamp === 'number' ? timestamp : Date.now();
            if (state.fonts.licensingAcknowledgedAt === resolved) {
                return state;
            }
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    licensingAcknowledgedAt: resolved,
                },
            };
        });
    },

    clearScene: () => {
        set((state) => ({
            ...state,
            settings: { ...DEFAULT_SCENE_SETTINGS },
            elements: {},
            order: [],
            bindings: createEmptyBindingsState(),
            macros: { byId: {}, allIds: [], exportedAt: undefined },
            fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
            interaction: createInitialInteractionState(),
            runtimeMeta: markDirty(state, 'clearScene'),
        }));
    },

    importScene: (payload) => {
        set((state) => {
            const elements = payload.elements ?? [];
            const sorted = [...elements].sort((a, b) => {
                const ai = typeof a.index === 'number' ? a.index : elements.indexOf(a);
                const bi = typeof b.index === 'number' ? b.index : elements.indexOf(b);
                return ai - bi;
            });

            const nextElements: Record<string, SceneElementRecord> = {};
            const nextOrder: string[] = [];
            const nextByElement: Record<string, ElementBindings> = {};

            for (const el of sorted) {
                if (!el || typeof el !== 'object') continue;
                if (typeof el.id !== 'string' || typeof el.type !== 'string') continue;
                nextOrder.push(el.id);
                nextElements[el.id] = {
                    id: el.id,
                    type: el.type,
                    createdAt: Date.now(),
                };
                nextByElement[el.id] = deserializeElementBindings(el);
            }

            const sortedOrder = sortElementIdsByZIndex(nextOrder, nextByElement);

            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            const nextSettings = {
                ...DEFAULT_SCENE_SETTINGS,
                ...(payload.sceneSettings ?? {}),
            } satisfies SceneSettingsState;

            const importTimestamp = Date.now();

            const normalizedFontAssets: Record<string, FontAsset> = {};
            if (payload.fontAssets) {
                for (const [assetId, asset] of Object.entries(payload.fontAssets)) {
                    if (!assetId || !asset) continue;
                    const id = typeof asset.id === 'string' ? asset.id : assetId;
                    normalizedFontAssets[id] = normalizeFontAssetInput({ ...asset, id } as FontAsset);
                }
            }
            const fontOrder = Object.keys(normalizedFontAssets);
            const fontLicensingAcknowledgedAt =
                typeof payload.fontLicensingAcknowledgedAt === 'number'
                    ? payload.fontLicensingAcknowledgedAt
                    : undefined;

            return {
                ...state,
                settings: nextSettings,
                elements: nextElements,
                order: sortedOrder,
                bindings: nextBindings,
                macros: buildMacroState(payload.macros),
                fonts: {
                    assets: normalizedFontAssets,
                    order: fontOrder,
                    totalBytes: computeFontBytes(normalizedFontAssets),
                    licensingAcknowledgedAt: fontLicensingAcknowledgedAt,
                },
                interaction: createInitialInteractionState(),
                runtimeMeta: {
                    ...state.runtimeMeta,
                    persistentDirty: false,
                    lastHydratedAt: importTimestamp,
                    lastMutationSource: 'importScene',
                    lastMutatedAt: importTimestamp,
                    hasInitializedScene: true,
                },
            };
        });
    },

    exportSceneDraft: () => {
        const state = get();
        const elements: SceneSerializedElement[] = [];
        state.order.forEach((id, idx) => {
            const element = state.elements[id];
            if (!element) return;
            const bindings = state.bindings.byElement[id] ?? {};
            elements.push(serializeElement(element, bindings, idx));
        });
        const fontAssets = state.fonts.order.reduce((acc, id) => {
            const asset = state.fonts.assets[id];
            if (asset) acc[id] = cloneFontAsset(asset);
            return acc;
        }, {} as Record<string, FontAsset>);
        return {
            elements,
            sceneSettings: { ...state.settings },
            macros: buildMacroPayload(state.macros),
            fontAssets: Object.keys(fontAssets).length ? fontAssets : undefined,
            fontLicensingAcknowledgedAt: state.fonts.licensingAcknowledgedAt,
        };
    },

    replaceMacros: (payload) => {
        set((state) => ({
            ...state,
            macros: buildMacroState(payload),
            runtimeMeta: markDirty(state, 'updateMacros'),
        }));
    },

    setInteractionState: (patch) => {
        set((state) => {
            const next: SceneInteractionState = { ...state.interaction };

            if ('selectedElementIds' in patch) {
                const normalized = normalizeSelection(state, patch.selectedElementIds ?? []);
                if (!selectionEquals(normalized, next.selectedElementIds)) {
                    next.selectedElementIds = normalized;
                }
            }

            if ('hoveredElementId' in patch) {
                const hovered = patch.hoveredElementId ?? null;
                const resolved = hovered && state.elements[hovered] ? hovered : null;
                if (resolved !== next.hoveredElementId) {
                    next.hoveredElementId = resolved;
                }
            }

            if ('editingElementId' in patch) {
                const editing = patch.editingElementId ?? null;
                const resolved = editing && state.elements[editing] ? editing : null;
                if (resolved !== next.editingElementId) {
                    next.editingElementId = resolved;
                }
            }

            if ('clipboard' in patch) {
                const clipboard = patch.clipboard ?? null;
                const shouldUpdate =
                    (!clipboard && next.clipboard !== null) ||
                    (clipboard && (!next.clipboard || clipboard !== next.clipboard));
                if (shouldUpdate) {
                    next.clipboard = clipboard;
                }
            }

            if (
                next === state.interaction ||
                (selectionEquals(next.selectedElementIds, state.interaction.selectedElementIds) &&
                    next.hoveredElementId === state.interaction.hoveredElementId &&
                    next.editingElementId === state.interaction.editingElementId &&
                    next.clipboard === state.interaction.clipboard)
            ) {
                return state;
            }

            return {
                ...state,
                interaction: next,
            };
        });
    },
});

const sceneStoreCreator: StateCreator<SceneStoreState> = (set, get) => createSceneStoreState(set, get);

export const createSceneStore = () => create<SceneStoreState>(sceneStoreCreator);

export const useSceneStore = createSceneStore();
