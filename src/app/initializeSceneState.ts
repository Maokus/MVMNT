import { useSceneStore } from '@state/sceneStore';
import { wireSceneStoreRuntime } from '@state/scene/sceneStoreRuntimeWiring';

let initialized = false;

/** Application composition root for state-to-runtime dependencies. */
export function initializeSceneState(): void {
    if (initialized) return;
    initialized = true;
    wireSceneStoreRuntime(useSceneStore);
}
