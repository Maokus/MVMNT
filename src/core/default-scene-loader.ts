import { importScene } from '@persistence/import';
import { useSceneStore, type SceneMacroDefinition, type SceneSettingsState } from '@state/sceneStore';
import type { SceneMetadataState } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';
import {
    decodeSceneText,
    parseLegacyInlineScene,
    parseScenePackage,
    ScenePackageError,
} from '@persistence/scene-package';

interface DefaultSceneCache {
    sceneData: string | Uint8Array;
    settings?: Partial<SceneSettingsState>;
    metadata?: Partial<SceneMetadataState>;
}

let defaultSceneCachePromise: Promise<DefaultSceneCache | null> | null = null;

function toUint8Array(value: unknown): Uint8Array | null {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof value === 'string') {
        const out = new Uint8Array(value.length);
        for (let i = 0; i < value.length; i++) {
            out[i] = value.charCodeAt(i) & 0xff;
        }
        return out;
    }
    return null;
}

async function fetchDefaultSceneBytes(): Promise<Uint8Array | null> {
    try {
        if (typeof process !== 'undefined' && process.versions?.node) {
            const { readFile } = await import('fs/promises');
            const { resolve } = await import('path');
            try {
                const fileUrl = new URL('../templates/default.mvt', import.meta.url);
                if (fileUrl.protocol === 'file:') {
                    const buffer = await readFile(fileUrl);
                    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
                }
            } catch {}
            const fallbackPath = resolve(process.cwd(), 'src/templates/default.mvt');
            const buffer = await readFile(fallbackPath);
            return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        }

        if (typeof fetch !== 'function') {
            console.error('[default-scene-loader] fetch is not available to load default scene asset');
            return null;
        }
        const resourceUrl = new URL('../templates/default.mvt', import.meta.url);
        const response = await fetch(resourceUrl);
        if (!response.ok) {
            console.error(
                `[default-scene-loader] Failed to fetch default scene asset: ${response.status} ${response.statusText}`
            );
            return null;
        }
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    } catch (error) {
        console.error('[default-scene-loader] Failed to load bundled default.mvt', error);
        return null;
    }
}

async function resolveDefaultSceneCache(): Promise<DefaultSceneCache | null> {
    if (!defaultSceneCachePromise) {
        defaultSceneCachePromise = fetchDefaultSceneBytes().then((bytes) => {
            if (!bytes) return null;

            try {
                const packaged = parseScenePackage(bytes);
                const envelope = packaged.envelope;
                const settings = envelope?.scene?.sceneSettings ? { ...envelope.scene.sceneSettings } : undefined;
                const metadata = envelope?.metadata ? { ...envelope.metadata } : undefined;
                return { sceneData: bytes, settings, metadata };
            } catch (error) {
                if (error instanceof ScenePackageError && error.code === 'ERR_PACKAGE_FORMAT') {
                    try {
                        const text = decodeSceneText(bytes);
                        const legacy = parseLegacyInlineScene(text);
                        const envelope = legacy.envelope;
                        const settings = envelope?.scene?.sceneSettings
                            ? { ...envelope.scene.sceneSettings }
                            : undefined;
                        const metadata = envelope?.metadata ? { ...envelope.metadata } : undefined;
                        return { sceneData: text, settings, metadata };
                    } catch (legacyError) {
                        console.error(
                            '[default-scene-loader] Failed to parse legacy default scene payload',
                            legacyError
                        );
                        return null;
                    }
                }
                console.error('[default-scene-loader] Failed to parse packaged default.mvt', error);
                return null;
            }
        });
    }
    return defaultSceneCachePromise;
}

export async function loadDefaultScene(source = 'default-scene-loader.loadDefaultScene'): Promise<boolean> {
    const cache = await resolveDefaultSceneCache();
    if (!cache?.sceneData) return false;
    try {
        const result = await importScene(cache.sceneData);
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
