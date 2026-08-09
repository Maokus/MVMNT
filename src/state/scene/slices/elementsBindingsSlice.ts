import type { SceneStoreState } from '../storeTypes';

export type ElementsBindingsSlice = Pick<
    SceneStoreState,
    | 'settings'
    | 'elements'
    | 'bindings'
    | 'addElement'
    | 'moveElement'
    | 'duplicateElement'
    | 'removeElement'
    | 'updateElementId'
    | 'updateSettings'
    | 'updateBindings'
>;

/** Selects the element/property-binding capability from the composed store. */
export function createElementsBindingsSlice(state: SceneStoreState): ElementsBindingsSlice {
    const {
        settings,
        elements,
        bindings,
        addElement,
        moveElement,
        duplicateElement,
        removeElement,
        updateElementId,
        updateSettings,
        updateBindings,
    } = state;
    return {
        settings,
        elements,
        bindings,
        addElement,
        moveElement,
        duplicateElement,
        removeElement,
        updateElementId,
        updateSettings,
        updateBindings,
    };
}
