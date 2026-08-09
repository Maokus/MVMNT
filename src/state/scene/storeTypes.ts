/**
 * Internal scene-store contract boundary. Application consumers continue to
 * import from `@state/sceneStore`; scene modules use this path to avoid a
 * dependency on the singleton facade.
 */
export type {
    BindingState,
    ConstantBindingState,
    ElementBindings,
    ElementBindingsPatch,
    MacroBindingsIndex,
    MacroTargetAssignment,
    MacroBindingState,
    PropertyClipboard,
    SceneBindingsState,
    SceneElementInput,
    SceneElementRecord,
    SceneFontsState,
    SceneImportPayload,
    SceneInteractionState,
    SceneMacroDefinition,
    SceneMacroState,
    SceneMutationSource,
    SceneRuntimeMeta,
    SceneSerializedElement,
    SceneSerializedMacros,
    SceneSettingsState,
    SceneStoreActions,
    SceneStoreComputedExport,
    SceneStoreState,
} from './storeComposition';
