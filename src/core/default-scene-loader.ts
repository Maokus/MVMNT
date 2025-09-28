import defaultSceneRaw from '../templates/default.mvt?raw';
import { DocumentGateway, type PersistentDocumentV1 } from '@persistence/document-gateway';
import type { SceneSettingsState } from '@state/sceneStore';
import type { SceneMetadataState } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';

const DEFAULT_SCENE_ENVELOPE = (() => {
    try {
        return JSON.parse(defaultSceneRaw);
    } catch (error) {
        console.error('[default-scene-loader] Failed to parse bundled default.mvt', error);
        return null;
    }
})();

const DEFAULT_DOCUMENT_JSON = (() => {
    if (!DEFAULT_SCENE_ENVELOPE) return null;
    const tl = DEFAULT_SCENE_ENVELOPE.timeline || {};
    const doc: PersistentDocumentV1 = {
        timeline: { ...(tl.timeline || {}) },
        tracks: { ...(tl.tracks || {}) },
        tracksOrder: Array.isArray(tl.tracksOrder) ? [...tl.tracksOrder] : [],
        playbackRange: tl.playbackRange ? { ...tl.playbackRange } : undefined,
        playbackRangeUserDefined: !!tl.playbackRangeUserDefined,
        rowHeight: typeof tl.rowHeight === 'number' ? tl.rowHeight : 30,
        midiCache: { ...(tl.midiCache || {}) },
        scene: {
            elements: Array.isArray(DEFAULT_SCENE_ENVELOPE.scene?.elements)
                ? DEFAULT_SCENE_ENVELOPE.scene.elements.map((el: any) => ({ ...el }))
                : [],
            sceneSettings: DEFAULT_SCENE_ENVELOPE.scene?.sceneSettings
                ? { ...DEFAULT_SCENE_ENVELOPE.scene.sceneSettings }
                : undefined,
            macros: DEFAULT_SCENE_ENVELOPE.scene?.macros
                ? JSON.parse(JSON.stringify(DEFAULT_SCENE_ENVELOPE.scene.macros))
                : undefined,
        },
        metadata: DEFAULT_SCENE_ENVELOPE.metadata ? { ...DEFAULT_SCENE_ENVELOPE.metadata } : undefined,
    };
    return JSON.stringify(doc);
})();

const DEFAULT_SETTINGS_JSON = DEFAULT_SCENE_ENVELOPE?.scene?.sceneSettings
    ? JSON.stringify(DEFAULT_SCENE_ENVELOPE.scene.sceneSettings)
    : null;

const DEFAULT_METADATA_JSON = DEFAULT_SCENE_ENVELOPE?.metadata
    ? JSON.stringify(DEFAULT_SCENE_ENVELOPE.metadata)
    : null;

export async function loadDefaultScene(source = 'default-scene-loader.loadDefaultScene'): Promise<boolean> {
    if (!DEFAULT_DOCUMENT_JSON) return false;
    try {
        const doc: PersistentDocumentV1 = JSON.parse(DEFAULT_DOCUMENT_JSON);
        DocumentGateway.apply(doc);
        return true;
    } catch (error) {
        console.error(`[${source}] failed to load default scene`, error);
        return false;
    }
}

export function getDefaultSceneSettings(): Partial<SceneSettingsState> | undefined {
    if (!DEFAULT_SETTINGS_JSON) return undefined;
    try {
        return JSON.parse(DEFAULT_SETTINGS_JSON);
    } catch {
        return undefined;
    }
}

export async function resetToDefaultScene(visualizer: any): Promise<boolean> {
    const success = await loadDefaultScene('default-scene-loader.resetToDefaultScene');
    if (!success) return false;
    try {
        useTimelineStore.getState().clearAllTracks();
    } catch {}
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
    if (!DEFAULT_METADATA_JSON) return undefined;
    try {
        return JSON.parse(DEFAULT_METADATA_JSON);
    } catch {
        return undefined;
    }
}
