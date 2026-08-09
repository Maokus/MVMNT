import { createSceneStore } from './scene/storeComposition';

export {
    createSceneStore,
    DEFAULT_SCENE_SETTINGS,
    deserializeElementBindings,
    migrateLegacyAudioFeatureBinding,
} from './scene/storeComposition';
export { createSceneSnapshot } from './scene/snapshot';
export type { SceneSnapshot } from './scene/snapshot';
export type {
    BindingState,
    ConstantBindingState,
    ElementBindings,
    ElementBindingsPatch,
    MacroBindingState,
    MacroBindingsIndex,
    MacroTargetAssignment,
    SceneBindingsState,
    SceneDocumentState,
    SceneElementInput,
    SceneElementRecord,
    SceneFontsState,
    SceneImportPayload,
    SceneMacroDefinition,
    SceneMacroState,
    SceneMutationSource,
    SceneRuntimeMeta,
    SceneSerializedElement,
    SceneSerializedMacros,
    SceneSettingsState,
    SceneSnapshot as SceneStoreComputedExport,
    SceneStoreActions,
    SceneStoreState,
} from './scene/storeTypes';

/** Stable application-facing scene store facade. */
export const useSceneStore = createSceneStore();
