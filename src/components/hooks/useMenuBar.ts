import { globalMacroManager } from '../../visualizer/macro-manager';
import { SceneNameGenerator } from '../../visualizer/scene-name-generator';

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
    const saveScene = () => {
        if (visualizer) {
            try {
                const sceneBuilder = visualizer.getSceneBuilder?.();
                if (sceneBuilder) {
                    // Prefer visualizer export so we capture exportSettings (fps, width, height)
                    const baseData =
                        typeof visualizer.exportSceneConfig === 'function'
                            ? visualizer.exportSceneConfig()
                            : sceneBuilder.serializeScene();
                    const sceneConfig = {
                        name: sceneName,
                        ...baseData,
                        timestamp: new Date().toISOString(),
                    };

                    // Save to localStorage for compatibility
                    const savedScenes = JSON.parse(localStorage.getItem('midivis-scenes') || '[]');
                    savedScenes.push(sceneConfig);
                    localStorage.setItem('midivis-scenes', JSON.stringify(savedScenes));

                    // Also trigger JSON download
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
                    alert(`Scene "${sceneName}" saved successfully and downloaded as JSON!`);
                } else {
                    console.log('Save scene: scene builder not available');
                }
            } catch (error) {
                console.error('Error saving scene:', error);
                alert('Error saving scene. Check console for details.');
            }
        } else {
            console.log('Save scene functionality: visualizer not available');
        }
    };

    const loadScene = () => {
        // Create a file input for JSON upload
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';

        fileInput.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];

            if (file) {
                try {
                    const text = await file.text();
                    const sceneConfig = JSON.parse(text);

                    // Validate that this is a valid scene file
                    if (!sceneConfig.elements && !sceneConfig.version) {
                        throw new Error('Invalid scene file format - missing elements or version');
                    }

                    if (visualizer) {
                        const sceneBuilder = visualizer.getSceneBuilder?.();
                        if (sceneBuilder) {
                            // Prefer visualizer import so exportSettings (fps/resolution) are applied early
                            const success =
                                typeof visualizer.importSceneConfig === 'function'
                                    ? visualizer.importSceneConfig(sceneConfig)
                                    : sceneBuilder.loadScene(sceneConfig);

                            if (success) {
                                // Update scene name
                                if (sceneConfig.name) {
                                    onSceneNameChange(sceneConfig.name);
                                }

                                if (visualizer.invalidateRender) {
                                    visualizer.invalidateRender();
                                }

                                // Trigger refresh of UI components
                                if (onSceneRefresh) {
                                    onSceneRefresh();
                                }

                                console.log(`Scene "${sceneConfig.name || 'Untitled'}" loaded successfully from JSON`);
                                alert(`Scene "${sceneConfig.name || 'Untitled'}" loaded successfully from JSON!`);
                            } else {
                                alert(
                                    'Failed to load scene from JSON file. The file may be corrupted or incompatible.'
                                );
                            }
                        } else {
                            alert('Scene builder not available. Please try again.');
                        }
                    } else {
                        alert('Visualizer not available. Please try again.');
                    }
                } catch (error) {
                    console.error('Error loading scene from JSON:', error);
                    alert('Error loading scene from JSON. Please check that the file is a valid scene JSON file.');
                }
            }

            // Clean up
            document.body.removeChild(fileInput);
        };

        // Handle case where user cancels file dialog
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
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }

                // Trigger refresh of UI components
                if (onSceneRefresh) {
                    onSceneRefresh();
                }

                console.log('Scene cleared - all layers removed');
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
