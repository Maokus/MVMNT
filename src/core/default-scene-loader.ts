import defaultSceneRaw from '../templates/default.mvt?raw';
import { importScene } from '@persistence/import';
import type { SceneSettingsState } from '@state/sceneStore';
import type { SceneMetadataState } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';

const DEFAULT_SCENE_STRING = typeof defaultSceneRaw === 'string' ? defaultSceneRaw : '';

const DEFAULT_SCENE_ENVELOPE = (() => {
    try {
        return DEFAULT_SCENE_STRING ? JSON.parse(DEFAULT_SCENE_STRING) : null;
    } catch (error) {
        console.error('[default-scene-loader] Failed to parse bundled default.mvt', error);
        return null;
    }
})();

const DEFAULT_SCENE_SETTINGS = DEFAULT_SCENE_ENVELOPE?.scene?.sceneSettings;
const DEFAULT_SCENE_METADATA = DEFAULT_SCENE_ENVELOPE?.metadata;

export async function loadDefaultScene(source = 'default-scene-loader.loadDefaultScene'): Promise<boolean> {
    if (!DEFAULT_SCENE_STRING) return false;
    try {
        const result = await importScene(DEFAULT_SCENE_STRING);
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

export function getDefaultSceneSettings(): Partial<SceneSettingsState> | undefined {
    if (!DEFAULT_SCENE_SETTINGS) return undefined;
    return { ...DEFAULT_SCENE_SETTINGS };
}

export async function resetToDefaultScene(visualizer: any): Promise<boolean> {
    try {
        useTimelineStore.getState().clearAllTracks();
    } catch {}
    const success = await loadDefaultScene('default-scene-loader.resetToDefaultScene');
    if (!success) return false;
    const settings = getDefaultSceneSettings();
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

export function getDefaultSceneMetadata(): Partial<SceneMetadataState> | undefined {
    if (!DEFAULT_SCENE_METADATA) return undefined;
    return { ...DEFAULT_SCENE_METADATA };
}
