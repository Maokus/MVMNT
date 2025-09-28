import { loadDefaultScene, resetToDefaultScene } from '@core/default-scene-loader';
import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { useUndo } from './UndoContext';
import { useSceneStore } from '@state/sceneStore';

interface UseMenuBarProps {
    visualizer: any;
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onSceneRefresh?: () => void;
}

interface MenuBarActions {
    saveScene: () => void;
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

    const saveScene = async () => {
        try {
            const res = await exportScene(sceneName);
            if (!res.ok) {
                alert(res.errors?.map((e) => e.message).join('\n') || 'Export failed.');
                return;
            }
            const safeName = sceneName.replace(/[^a-zA-Z0-9]/g, '_') || 'scene';
            const { blob, mode } = res;
            const exportBlob =
                blob ||
                (mode === 'zip-package'
                    ? new Blob([res.zip], { type: 'application/zip' })
                    : new Blob([res.json], { type: 'application/json' }));
            const extension = mode === 'zip-package' ? '.mvmntpkg' : '.mvt';
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
        // Accept legacy .json exports and new .mvt extension
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
                const result = await importScene(buffer);
                if (!result.ok) {
                    alert('Import failed: ' + (result.errors.map((e) => e.message).join('\n') || 'Unknown error'));
                } else {
                    // Attempt to read name from envelope metadata when present
                    try {
                        const parsed = JSON.parse(await file.text());
                        if (parsed?.metadata?.name) {
                            onSceneNameChange(parsed.metadata.name);
                        } else if (file.name) {
                            // Fallback: derive scene name from filename (strip extension)
                            const base = file.name.replace(/\.(mvt|json)$/i, '');
                            if (base) onSceneNameChange(base);
                        }
                    } catch {}
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
