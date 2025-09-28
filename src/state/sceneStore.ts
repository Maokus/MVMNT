import { create, type StateCreator } from 'zustand';
import type { Macro } from '@state/scene/macros';
import type { PropertyBindingData } from '@bindings/property-bindings';

export type BindingState = ConstantBindingState | MacroBindingState;

export interface ConstantBindingState {
    type: 'constant';
    value: unknown;
}

export interface MacroBindingState {
    type: 'macro';
    macroId: string;
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
    | 'clearScene'
    | 'importScene';

export interface SceneBindingsState {
    byElement: Record<string, ElementBindings>;
    byMacro: MacroBindingsIndex;
}

export interface SceneStoreComputedExport {
    elements: SceneSerializedElement[];
    sceneSettings: SceneSettingsState;
    macros?: SceneSerializedMacros;
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
    deleteMacro: (macroId: string) => void;
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
    return binding.type === 'constant'
        ? { type: 'constant', value: binding.value }
        : { type: 'macro', macroId: binding.macroId };
}

function cloneBindingsMap(bindings: ElementBindings): ElementBindings {
    const result: ElementBindings = {};
    for (const [key, binding] of Object.entries(bindings)) {
        result[key] = cloneBinding(binding);
    }
    return result;
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
        serialized[key] =
            binding.type === 'constant'
                ? ({ type: 'constant', value: binding.value } satisfies PropertyBindingData)
                : ({ type: 'macro', macroId: binding.macroId } satisfies PropertyBindingData);
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
    };
}

function markDirty(prev: SceneStoreState, source: SceneMutationSource): SceneRuntimeMeta {
    const now = Date.now();
    return {
        ...prev.runtimeMeta,
        persistentDirty: true,
        lastMutationSource: source,
        lastMutatedAt: now,
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
        case 'midiTrackRef':
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

            return {
                ...state,
                order: nextOrder,
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
            const nextBindingsForElement: ElementBindings = { ...existing };

            for (const [key, binding] of Object.entries(patch)) {
                if (binding == null) {
                    if (key in nextBindingsForElement) {
                        delete nextBindingsForElement[key];
                        changed = true;
                    }
                    continue;
                }

                const normalized =
                    binding.type === 'constant'
                        ? ({ type: 'constant', value: binding.value } as BindingState)
                        : ({ type: 'macro', macroId: binding.macroId } as BindingState);

                const current = nextBindingsForElement[key];
                if (!current || !bindingEquals(current, normalized)) {
                    nextBindingsForElement[key] = normalized;
                    changed = true;
                }
            }

            if (!changed) return state;

            const nextByElement = { ...state.bindings.byElement, [elementId]: nextBindingsForElement };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            return {
                ...state,
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

    clearScene: () => {
        set((state) => ({
            ...state,
            settings: { ...DEFAULT_SCENE_SETTINGS },
            elements: {},
            order: [],
            bindings: createEmptyBindingsState(),
            macros: { byId: {}, allIds: [], exportedAt: undefined },
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

            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
            };

            const nextSettings = {
                ...DEFAULT_SCENE_SETTINGS,
                ...(payload.sceneSettings ?? {}),
            } satisfies SceneSettingsState;

            const importTimestamp = Date.now();

            return {
                ...state,
                settings: nextSettings,
                elements: nextElements,
                order: nextOrder,
                bindings: nextBindings,
                macros: buildMacroState(payload.macros),
                interaction: createInitialInteractionState(),
                runtimeMeta: {
                    ...state.runtimeMeta,
                    persistentDirty: false,
                    lastHydratedAt: importTimestamp,
                    lastMutationSource: 'importScene',
                    lastMutatedAt: importTimestamp,
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
        return {
            elements,
            sceneSettings: { ...state.settings },
            macros: buildMacroPayload(state.macros),
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
