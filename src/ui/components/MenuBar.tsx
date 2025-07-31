import React, { useState, useRef, useEffect } from 'react';
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

interface MenuBarProps {
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onMidiLoad: (file: File) => void;
    onExport: () => void;
    exportStatus: string;
    canExport: boolean;
    visualizer?: any; // Add visualizer prop to handle scene operations
    onSceneRefresh?: () => void; // Add scene refresh callback
}

const MenuBar: React.FC<MenuBarProps> = ({
    sceneName,
    onSceneNameChange,
    onMidiLoad,
    onExport,
    exportStatus,
    canExport,
    visualizer,
    onSceneRefresh
}) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [showSceneMenu, setShowSceneMenu] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sceneMenuRef = useRef<HTMLDivElement>(null);

    // Handle clicks outside scene menu to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sceneMenuRef.current && !sceneMenuRef.current.contains(event.target as Node)) {
                setShowSceneMenu(false);
            }
        };

        if (showSceneMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showSceneMenu]);

    const handleSceneNameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsEditingName(false);
    };

    const handleSceneNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setIsEditingName(false);
        } else if (e.key === 'Escape') {
            setIsEditingName(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onMidiLoad(file);
        }
    };

    const saveScene = () => {
        if (visualizer) {
            try {
                const sceneBuilder = visualizer.getSceneBuilder();
                if (sceneBuilder) {
                    // Get scene configuration
                    const sceneConfig = {
                        name: sceneName,
                        elements: sceneBuilder.getAllElements().map((element: any) => ({
                            type: element.type,
                            id: element.id,
                            config: element.config,
                            visible: element.visible,
                            zIndex: element.zIndex
                        })),
                        timestamp: new Date().toISOString()
                    };

                    // Save to localStorage for now
                    const savedScenes = JSON.parse(localStorage.getItem('midivis-scenes') || '[]');
                    savedScenes.push(sceneConfig);
                    localStorage.setItem('midivis-scenes', JSON.stringify(savedScenes));

                    console.log(`Scene "${sceneName}" saved successfully`);
                    alert(`Scene "${sceneName}" saved successfully!`);
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
        setShowSceneMenu(false);
    };

    const loadScene = () => {
        if (visualizer) {
            try {
                const savedScenes = JSON.parse(localStorage.getItem('midivis-scenes') || '[]');
                if (savedScenes.length === 0) {
                    alert('No saved scenes found.');
                    setShowSceneMenu(false);
                    return;
                }

                // For now, just load the most recent scene
                // TODO: Implement a proper scene selection dialog
                const mostRecentScene = savedScenes[savedScenes.length - 1];

                const sceneBuilder = visualizer.getSceneBuilder();
                if (sceneBuilder) {
                    // Clear current scene
                    sceneBuilder.clearElements();

                    // Load elements from saved scene
                    mostRecentScene.elements.forEach((elementConfig: any) => {
                        const success = sceneBuilder.addElement(
                            elementConfig.type,
                            elementConfig.id,
                            elementConfig.config
                        );

                        if (success) {
                            const element = sceneBuilder.getElement(elementConfig.id);
                            if (element) {
                                element.visible = elementConfig.visible;
                                if (elementConfig.zIndex !== undefined) {
                                    element.zIndex = elementConfig.zIndex;
                                }
                            }
                        }
                    });

                    // Update scene name
                    onSceneNameChange(mostRecentScene.name);

                    if (visualizer.render) {
                        visualizer.render();
                    }

                    // Trigger refresh of UI components
                    if (onSceneRefresh) {
                        onSceneRefresh();
                    }

                    console.log(`Scene "${mostRecentScene.name}" loaded successfully`);
                    alert(`Scene "${mostRecentScene.name}" loaded successfully!`);
                } else {
                    console.log('Load scene: scene builder not available');
                }
            } catch (error) {
                console.error('Error loading scene:', error);
                alert('Error loading scene. Check console for details.');
            }
        } else {
            console.log('Load scene functionality: visualizer not available');
        }
        setShowSceneMenu(false);
    };

    const clearScene = () => {
        if (visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                sceneBuilder.clearElements();
                if (visualizer.render) {
                    visualizer.render();
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
        setShowSceneMenu(false);
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

            if (visualizer.render) {
                visualizer.render();
            }

            // Trigger refresh of UI components
            if (onSceneRefresh) {
                onSceneRefresh();
            }

            console.log(`New default scene created with name: ${newSceneName}`);
        } else {
            console.log('New default scene functionality: visualizer not available');
        }
        setShowSceneMenu(false);
    };

    return (
        <div className="menu-bar">
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".mid,.midi"
                onChange={handleFileChange}
            />

            <div className="menu-section quick-actions">
                <h3>Midivis v0.7a</h3>
            </div>

            <div className="menu-section scene-name-section">
                <div className="scene-name-container">
                    {isEditingName ? (
                        <form onSubmit={handleSceneNameSubmit}>
                            <input
                                type="text"
                                className="scene-name-input"
                                value={sceneName}
                                onChange={(e) => onSceneNameChange(e.target.value)}
                                onBlur={() => setIsEditingName(false)}
                                onKeyDown={handleSceneNameKeyDown}
                                autoFocus
                            />
                        </form>
                    ) : (
                        <span
                            className="scene-name-display"
                            onDoubleClick={() => setIsEditingName(true)}
                        >
                            {sceneName}
                        </span>
                    )}

                    <button
                        className="scene-name-edit-btn"
                        onClick={() => setIsEditingName(true)}
                        title="Edit scene name"
                    >
                        ✏️
                    </button>

                    <div className="scene-menu-container" ref={sceneMenuRef}>
                        <button
                            className="scene-menu-btn"
                            onClick={() => setShowSceneMenu(!showSceneMenu)}
                            title="Scene options"
                        >
                            ⋯
                        </button>
                        {showSceneMenu && (
                            <div className={`scene-menu-dropdown ${showSceneMenu ? 'show' : ''}`}>
                                <div className="scene-menu-item" onClick={saveScene}>💾 Save Scene</div>
                                <div className="scene-menu-item" onClick={loadScene}>📂 Load Scene</div>
                                <div className="scene-menu-item" onClick={clearScene}>🗑️ Clear All Layers</div>
                                <div className="scene-menu-item" onClick={createNewDefaultScene}>✨ New Default Scene</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="menu-section export-actions">
                <button
                    className="btn-export"
                    onClick={onExport}
                    disabled={!canExport}
                >
                    📸 Export PNG Sequence
                </button>
                <span id="exportStatus">{exportStatus}</span>
            </div>
        </div>
    );
};

export default MenuBar;
