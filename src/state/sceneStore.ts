import { createSceneStore } from './scene/storeComposition';
import { wireSceneStoreRuntime } from './scene/sceneStoreRuntimeWiring';

export * from './scene/storeComposition';

/** Stable application-facing scene store facade. */
export const useSceneStore = createSceneStore();
wireSceneStoreRuntime(useSceneStore);
