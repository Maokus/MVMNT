import type { SceneStoreState } from '../storeTypes';

export type AutomationMacrosSlice = Pick<
    SceneStoreState,
    | 'automation'
    | 'macros'
    | 'createMacro'
    | 'updateMacroValue'
    | 'renameMacro'
    | 'reorderMacros'
    | 'deleteMacro'
    | 'replaceMacros'
    | 'setAutomationChannel'
    | 'removeAutomationChannel'
    | 'updateAutomationKeyframes'
>;

/** Selects automation and macro behavior from the composed store. */
export function createAutomationMacrosSlice(state: SceneStoreState): AutomationMacrosSlice {
    const {
        automation,
        macros,
        createMacro,
        updateMacroValue,
        renameMacro,
        reorderMacros,
        deleteMacro,
        replaceMacros,
        setAutomationChannel,
        removeAutomationChannel,
        updateAutomationKeyframes,
    } = state;
    return {
        automation,
        macros,
        createMacro,
        updateMacroValue,
        renameMacro,
        reorderMacros,
        deleteMacro,
        replaceMacros,
        setAutomationChannel,
        removeAutomationChannel,
        updateAutomationKeyframes,
    };
}
