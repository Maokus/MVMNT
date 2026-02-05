import type {
    ElementBindings,
    MacroBindingAssignment,
    SceneElementRecord,
    SceneSettingsState,
    SceneStoreState,
} from '../sceneStore';

export interface SceneElementView {
    id: string;
    type: string;
    index: number;
    bindings: ElementBindings;
}

export interface MacroAssignmentView extends MacroBindingAssignment {
    macroId: string;
}

export interface SceneSelectors {
    selectOrderedElements: (state: SceneStoreState) => SceneElementView[];
    selectMacroAssignments: (state: SceneStoreState) => MacroAssignmentView[];
    selectElementById: (state: SceneStoreState, elementId: string) => SceneElementRecord | undefined;
    selectSceneSettings: (state: SceneStoreState) => SceneSettingsState;
}

function stableValueFingerprint(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'bigint') return `bigint:${value.toString()}`;
    if (typeof value !== 'object') return `${typeof value}:${String(value)}`;
    if (Array.isArray(value)) return `array:[${value.map((entry) => stableValueFingerprint(entry)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => ({ key, val }))
        .sort((a, b) => a.key.localeCompare(b.key));
    return `object:{${entries.map(({ key, val }) => `${key}:${stableValueFingerprint(val)}`).join(',')}}`;
}

function bindingsFingerprint(bindings: ElementBindings): string {
    const pairs = Object.entries(bindings)
        .map(([property, binding]) => {
            if (binding.type === 'constant') {
                return `${property}=const:${stableValueFingerprint(binding.value)}`;
            }
            if (binding.type === 'macro') {
                return `${property}=macro:${binding.macroId}`;
            }
            return `${property}=unknown:${stableValueFingerprint(binding)}`;
        })
        .sort();
    return pairs.join('|');
}

function macroAssignmentsFingerprint(byMacro: SceneStoreState['bindings']['byMacro']): string {
    const slices = Object.entries(byMacro)
        .map(([macroId, assignments]) => {
            const key = assignments
                .map((assignment) => `${assignment.elementId}:${assignment.propertyPath}`)
                .sort()
                .join(',');
            return `${macroId}=>${key}`;
        })
        .sort();
    return slices.join('|');
}

export const selectOrderedElementIds = (state: SceneStoreState): string[] => state.order;

export const createSceneSelectors = (initialState?: SceneStoreState): SceneSelectors => {
    let cachedElementsSignature: string | null = null;
    let cachedElementsResult: SceneElementView[] = [];

    let cachedAssignmentsSignature: string | null = null;
    let cachedAssignmentsResult: MacroAssignmentView[] = [];

    if (initialState) {
        cachedElementsSignature = `${initialState.order.join(',')}|${initialState.order
            .map((id) => bindingsFingerprint(initialState.bindings.byElement[id] ?? {}))
            .join('|')}`;
        cachedElementsResult = initialState.order.map((id, index) => ({
            id,
            type: initialState.elements[id]?.type ?? 'unknown',
            index,
            bindings: initialState.bindings.byElement[id] ?? {},
        }));
        cachedAssignmentsSignature = macroAssignmentsFingerprint(initialState.bindings.byMacro);
        cachedAssignmentsResult = Object.entries(initialState.bindings.byMacro).flatMap(([macroId, assignments]) =>
            assignments.map((assignment) => ({ macroId, ...assignment }))
        );
    }

    const selectOrderedElements = (state: SceneStoreState): SceneElementView[] => {
        const orderSignature = state.order.join(',');
        const bindingsSignature = state.order
            .map((id) => bindingsFingerprint(state.bindings.byElement[id] ?? {}))
            .join('|');
        const signature = `${orderSignature}|${bindingsSignature}`;
        if (signature === cachedElementsSignature) {
            return cachedElementsResult;
        }
        const next = state.order.map((id, index) => ({
            id,
            type: state.elements[id]?.type ?? 'unknown',
            index,
            bindings: state.bindings.byElement[id] ?? {},
        }));
        cachedElementsSignature = signature;
        cachedElementsResult = next;
        return next;
    };

    const selectMacroAssignments = (state: SceneStoreState): MacroAssignmentView[] => {
        const signature = macroAssignmentsFingerprint(state.bindings.byMacro);
        if (signature === cachedAssignmentsSignature) {
            return cachedAssignmentsResult;
        }
        const next = Object.entries(state.bindings.byMacro)
            .flatMap(([macroId, assignments]) => assignments.map((assignment) => ({ macroId, ...assignment })))
            .sort((a, b) => {
                if (a.macroId === b.macroId) {
                    if (a.elementId === b.elementId) return a.propertyPath.localeCompare(b.propertyPath);
                    return a.elementId.localeCompare(b.elementId);
                }
                return a.macroId.localeCompare(b.macroId);
            });
        cachedAssignmentsSignature = signature;
        cachedAssignmentsResult = next;
        return next;
    };

    const selectElementById = (state: SceneStoreState, elementId: string): SceneElementRecord | undefined =>
        state.elements[elementId];

    const selectSceneSettings = (state: SceneStoreState): SceneSettingsState => state.settings;

    return {
        selectOrderedElements,
        selectMacroAssignments,
        selectElementById,
        selectSceneSettings,
    };
};

export const sceneSelectors = createSceneSelectors();

