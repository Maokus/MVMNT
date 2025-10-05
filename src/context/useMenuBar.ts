import { loadDefaultScene, resetToDefaultScene } from '@core/default-scene-loader';
import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { extractSceneMetadataFromArtifact } from '@persistence/scene-package';
import { useUndo } from './UndoContext';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    const buffer = view.buffer as ArrayBuffer;
    if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
        return buffer;
    }
    if (typeof buffer.slice === 'function') {
        return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }
    return view.slice().buffer as ArrayBuffer;
}

interface UseMenuBarProps {
    visualizer: any;
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onSceneRefresh?: () => void;
}

interface MenuBarActions {
    saveScene: (projectName?: string) => Promise<void>;
    loadScene: () => void;
    clearScene: () => void;
    createNewDefaultScene: () => void;
}

export const useMenuBar = ({
    visualizer,
    sceneName,
    onSceneNameChange,
    onSceneRefresh,
}: UseMenuBarProps): MenuBarActions => {
    // Access undo (optional if provider disabled)
    let undo: ReturnType<typeof useUndo> | null = null;
    try {
        undo = useUndo();
    } catch {
        /* provider may not exist in some tests */
    }

    const saveScene = async (projectName?: string) => {
        try {
            const nameToUse = projectName?.trim() ? projectName.trim() : sceneName;
            const res = await exportScene(nameToUse);
            if (!res.ok) {
                alert(res.errors?.map((e) => e.message).join('\n') || 'Export failed.');
                return;
            }
            const safeName = nameToUse.replace(/[^a-zA-Z0-9]/g, '_') || 'scene';
            const { blob, mode } = res;
            const exportBlob =
                blob ||
                (mode === 'zip-package'
                    ? new Blob([toArrayBuffer(res.zip)], { type: 'application/zip' })
                    : new Blob([res.json], { type: 'application/json' }));
            const extension = mode === 'zip-package' ? '.mvt' : '.json';
            const url = URL.createObjectURL(exportBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log('Scene exported.');
        } catch (e) {
            console.error('Export error:', e);
            alert('Error exporting scene. See console.');
        }
    };

    const loadScene = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        // Accept packaged .mvt exports, inline .json, and legacy .mvmntpkg files
        fileInput.accept = '.mvt,.json,.mvmntpkg';
        fileInput.style.display = 'none';
        fileInput.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }
            try {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const result = await importScene(bytes);
                if (!result.ok) {
                    alert('Import failed: ' + (result.errors.map((e) => e.message).join('\n') || 'Unknown error'));
                } else {
                    const metadata = extractSceneMetadataFromArtifact(bytes);
                    if (metadata?.name?.trim()) {
                        onSceneNameChange(metadata.name.trim());
                    } else if (file.name) {
                        // Fallback: derive scene name from filename (strip extension)
                        const base = file.name.replace(/\.(mvt|json)$/i, '');
                        if (base) onSceneNameChange(base);
                    }
                    undo?.reset();
                    if (onSceneRefresh) onSceneRefresh();
                    console.log('Scene imported.');
                }
            } catch (err) {
                console.error('Load error:', err);
                alert('Error loading scene.');
            } finally {
                document.body.removeChild(fileInput);
            }
        };
        fileInput.oncancel = () => {
            document.body.removeChild(fileInput);
        };
        document.body.appendChild(fileInput);
        fileInput.click();
    };

    const clearScene = () => {
        const result = dispatchSceneCommand(
            { type: 'clearScene', clearMacros: true },
            { source: 'useMenuBar.clearScene' }
        );
        if (!result.success) {
            console.warn('Failed to clear scene', result.error);
            return;
        }
        try {
            useTimelineStore.getState().resetTimeline();
        } catch {}
        try {
            const settings = useSceneStore.getState().settings;
            visualizer?.canvas?.dispatchEvent(
                new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
            );
        } catch {}
        visualizer?.invalidateRender?.();
        if (onSceneRefresh) {
            onSceneRefresh();
        }
        console.log('Scene cleared - all elements removed');
    };

    const createNewDefaultScene = () => {
        if (!visualizer) {
            console.log('New default scene functionality: visualizer not available');
            return;
        }

        void (async () => {
            const newSceneName = SceneNameGenerator.generate();
            onSceneNameChange(newSceneName);

            let resetSucceeded = false;
            try {
                resetSucceeded = await resetToDefaultScene(visualizer);
            } catch (error) {
                console.warn('Failed to reset to default scene, attempting fallback import', error);
            }
            if (!resetSucceeded) {
                await loadDefaultScene('useMenuBar.createNewDefaultScene.fallback');
            }

            try {
                const settings = useSceneStore.getState().settings;
                visualizer?.canvas?.dispatchEvent(
                    new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
                );
            } catch {}

            try {
                visualizer?.invalidateRender?.();
            } catch {}

            if (onSceneRefresh) {
                onSceneRefresh();
            }

            console.log(`New default scene created with name: ${newSceneName}`);
        })();
    };

    return {
        saveScene,
        loadScene,
        clearScene,
        createNewDefaultScene,
    };
};
