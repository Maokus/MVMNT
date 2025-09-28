import { createDefaultMIDIScene, resetToDefaultScene } from '@core/scene-templates';
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
        if (visualizer) {
            // Generate a new scene name using the scene name generator
            const newSceneName = SceneNameGenerator.generate();

            // Update scene name first
            onSceneNameChange(newSceneName);

            // Reset to default scene
            // Use centralized template reset (handles track clearing & events)
            try {
                resetToDefaultScene(visualizer);
            } catch {
                // Fallback minimal default if template fails
                try {
                    createDefaultMIDIScene();
                } catch {}
            }

            // Reset scene settings to defaults and notify contexts about the reset
            try {
                const settings = useSceneStore.getState().settings;
                visualizer?.canvas?.dispatchEvent(
                    new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
                );
            } catch {}

            visualizer?.invalidateRender?.();

            // Trigger refresh of UI components
            if (onSceneRefresh) {
                onSceneRefresh();
            }

            console.log(`New default scene created with name: ${newSceneName}`);
        } else {
            console.log('New default scene functionality: visualizer not available');
        }
    };

    return {
        saveScene,
        loadScene,
        clearScene,
        createNewDefaultScene,
    };
};
