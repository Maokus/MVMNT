import { globalMacroManager } from '@bindings/macro-manager';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene, SERIALIZATION_V1_ENABLED } from '@persistence/index';
import { useUndo } from './UndoContext';

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

    const saveScene = () => {
        const feature = SERIALIZATION_V1_ENABLED();
        if (feature) {
            try {
                const res = exportScene();
                if (!res.ok) {
                    alert('Persistence feature disabled or export failed.');
                    return;
                }
                const safeName = sceneName.replace(/[^a-zA-Z0-9]/g, '_') || 'scene';
                const blob = new Blob([res.json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${safeName}.mvmnt.scene.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                console.log('Scene exported (persistence v1).');
            } catch (e) {
                console.error('Export error:', e);
                alert('Error exporting scene. See console.');
            }
            return;
        }
        // Fallback legacy behavior (visualizer-based export)
        if (visualizer) {
            try {
                const sceneBuilder = visualizer.getSceneBuilder?.();
                if (sceneBuilder) {
                    const baseData =
                        typeof visualizer.exportSceneConfig === 'function'
                            ? visualizer.exportSceneConfig()
                            : sceneBuilder.serializeScene();
                    const sceneConfig = {
                        name: sceneName,
                        ...baseData,
                        timestamp: new Date().toISOString(),
                    };
                    const jsonStr = JSON.stringify(sceneConfig, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${sceneName.replace(/[^a-zA-Z0-9]/g, '_')}_scene.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    console.log(`Scene "${sceneName}" saved successfully and downloaded as JSON`);
                } else {
                    console.log('Save scene: scene builder not available');
                }
            } catch (error) {
                console.error('Error saving scene (legacy):', error);
                alert('Error saving scene. Check console for details.');
            }
        } else {
            console.log('Save scene functionality: visualizer not available');
        }
    };

    const loadScene = () => {
        const feature = SERIALIZATION_V1_ENABLED();
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        fileInput.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }
            try {
                const text = await file.text();
                if (feature) {
                    const result = importScene(text);
                    if (!result.ok) {
                        alert('Import failed: ' + (result.errors.map((e) => e.message).join('\n') || 'Unknown error'));
                    } else {
                        undo?.reset(); // reset undo baseline after import
                        if (onSceneRefresh) onSceneRefresh();
                        console.log('Scene imported (persistence v1).');
                    }
                } else {
                    // Legacy pathway for visualizer scenes
                    const sceneConfig = JSON.parse(text);
                    if (visualizer) {
                        const sceneBuilder = visualizer.getSceneBuilder?.();
                        if (sceneBuilder) {
                            const success =
                                typeof visualizer.importSceneConfig === 'function'
                                    ? visualizer.importSceneConfig(sceneConfig)
                                    : sceneBuilder.loadScene(sceneConfig);
                            if (success) {
                                if (sceneConfig.name) onSceneNameChange(sceneConfig.name);
                                if (visualizer.invalidateRender) visualizer.invalidateRender();
                                if (onSceneRefresh) onSceneRefresh();
                                console.log('Scene loaded (legacy).');
                            } else {
                                alert('Failed to load scene file (legacy path).');
                            }
                        }
                    }
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
        if (visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                sceneBuilder.clearElements();
                globalMacroManager.clearMacros();
                // Reset scene settings to defaults and notify contexts
                if (sceneBuilder.resetSceneSettings) {
                    const settings = sceneBuilder.resetSceneSettings();
                    try {
                        visualizer.canvas?.dispatchEvent(
                            new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
                        );
                    } catch {}
                }
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }

                // Trigger refresh of UI components
                if (onSceneRefresh) {
                    onSceneRefresh();
                }

                console.log('Scene cleared - all elements removed');
            } else {
                console.log('Clear scene functionality: scene builder not available');
            }
        } else {
            console.log('Clear scene functionality: visualizer not available');
        }
    };

    const createNewDefaultScene = () => {
        if (visualizer) {
            // Generate a new scene name using the scene name generator
            const newSceneName = SceneNameGenerator.generate();

            // Update scene name first
            onSceneNameChange(newSceneName);

            // Reset to default scene
            if (visualizer.resetToDefaultScene) {
                visualizer.resetToDefaultScene();
            } else {
                // Fallback: clear and create default scene manually
                const sceneBuilder = visualizer.getSceneBuilder();
                if (sceneBuilder && sceneBuilder.createDefaultMIDIScene) {
                    sceneBuilder.clearElements();
                    sceneBuilder.createDefaultMIDIScene();
                }
            }

            // Reset scene settings to defaults and notify contexts about the reset
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder && sceneBuilder.getSceneSettings) {
                const settings = sceneBuilder.getSceneSettings();
                try {
                    visualizer.canvas?.dispatchEvent(
                        new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
                    );
                } catch {}
            }

            if (visualizer.invalidateRender) {
                visualizer.invalidateRender();
            }

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
