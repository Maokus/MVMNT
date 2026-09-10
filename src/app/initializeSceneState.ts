import { useSceneStore } from '@state/sceneStore';
import { wireSceneStoreRuntime } from '@state/scene/sceneStoreRuntimeWiring';
import { stopMacroSync } from '@state/scene/macroSyncService';

let initialized = false;
let disposeRuntime: (() => void) | undefined;

/** Application composition root for state-to-runtime dependencies. */
export function initializeSceneState(): void {
    if (initialized) return;
    initialized = true;
    disposeRuntime = wireSceneStoreRuntime(useSceneStore);
}

export function disposeSceneState(): void {
    disposeRuntime?.();
    stopMacroSync();
    disposeRuntime = undefined;
    initialized = false;
}
