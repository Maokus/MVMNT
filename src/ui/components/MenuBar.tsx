import React, { useState, useRef } from 'react';
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

interface MenuBarProps {
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onMidiLoad: (file: File) => void;
    onExport: () => void;
    exportStatus: string;
    canExport: boolean;
    visualizer?: any; // Add visualizer prop to handle scene operations
}

const MenuBar: React.FC<MenuBarProps> = ({
    sceneName,
    onSceneNameChange,
    onMidiLoad,
    onExport,
    exportStatus,
    canExport,
    visualizer
}) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [showSceneMenu, setShowSceneMenu] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        // TODO: Implement scene saving
        console.log('Save scene functionality to be implemented');
        setShowSceneMenu(false);
    };

    const loadScene = () => {
        // TODO: Implement scene loading
        console.log('Load scene functionality to be implemented');
        setShowSceneMenu(false);
    };

    const clearScene = () => {
        if (visualizer) {
            visualizer.sceneBuilder.clearElements();
            visualizer.render();
            console.log('Scene cleared - all layers removed');
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
            visualizer.resetToDefaultScene();
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

                    <div className="scene-menu-container">
                        <button
                            className="scene-menu-btn"
                            onClick={() => setShowSceneMenu(!showSceneMenu)}
                            title="Scene options"
                        >
                            ⋯
                        </button>
                        {showSceneMenu && (
                            <div className="scene-menu-dropdown">
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
