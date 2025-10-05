import { importScene } from '@persistence/import';
import type { SceneSettingsState } from '@state/sceneStore';
import type { SceneMetadataState } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';

interface DefaultSceneCache {
    sceneString: string;
    settings?: Partial<SceneSettingsState>;
    metadata?: Partial<SceneMetadataState>;
}

let defaultSceneCachePromise: Promise<DefaultSceneCache | null> | null = null;

async function resolveDefaultSceneCache(): Promise<DefaultSceneCache | null> {
    if (!defaultSceneCachePromise) {
        defaultSceneCachePromise = import('../templates/default.mvt?raw')
            .then((mod) => {
                const sceneString = typeof mod.default === 'string' ? mod.default : '';
                if (!sceneString) {
                    return null;
                }
                try {
                    const envelope = JSON.parse(sceneString);
                    const settings = envelope?.scene?.sceneSettings
                        ? { ...envelope.scene.sceneSettings }
                        : undefined;
                    const metadata = envelope?.metadata ? { ...envelope.metadata } : undefined;
                    return { sceneString, settings, metadata };
                } catch (error) {
                    console.error('[default-scene-loader] Failed to parse bundled default.mvt', error);
                    return null;
                }
            })
            .catch((error) => {
                console.error('[default-scene-loader] Failed to load bundled default.mvt', error);
                return null;
            });
    }
    return defaultSceneCachePromise;
}

export async function loadDefaultScene(source = 'default-scene-loader.loadDefaultScene'): Promise<boolean> {
    const cache = await resolveDefaultSceneCache();
    if (!cache?.sceneString) return false;
    try {
        const result = await importScene(cache.sceneString);
        if (!result.ok) {
            console.error(`[${source}] failed to load default scene`, result.errors);
            return false;
        }
        if (result.warnings.length > 0) {
            console.warn(
                `[${source}] default scene loaded with warnings:\n${result.warnings
                    .map((warning) => `- ${warning.message}`)
                    .join('\n')}`
            );
        }
        return true;
    } catch (error) {
        console.error(`[${source}] failed to load default scene`, error);
        return false;
    }
}

export async function resetToDefaultScene(visualizer: any): Promise<boolean> {
    try {
        useTimelineStore.getState().clearAllTracks();
    } catch {}
    const success = await loadDefaultScene('default-scene-loader.resetToDefaultScene');
    if (!success) return false;
    const settings = await getDefaultSceneSettings();
    if (visualizer?.canvas && settings) {
        try {
            visualizer.canvas.dispatchEvent(
                new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
            );
        } catch {}
    }
    try {
        visualizer?.invalidateRender?.();
    } catch {}
    return true;
}

export async function getDefaultSceneSettings(): Promise<Partial<SceneSettingsState> | undefined> {
    const cache = await resolveDefaultSceneCache();
    if (!cache?.settings) return undefined;
    return { ...cache.settings };
}

export async function getDefaultSceneMetadata(): Promise<Partial<SceneMetadataState> | undefined> {
    const cache = await resolveDefaultSceneCache();
    if (!cache?.metadata) return undefined;
    return { ...cache.metadata };
}
