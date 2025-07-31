import React, { useState, useRef } from 'react';

interface MenuBarProps {
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onMidiLoad: (file: File) => void;
    onExport: () => void;
    exportStatus: string;
    canExport: boolean;
}

const MenuBar: React.FC<MenuBarProps> = ({
    sceneName,
    onSceneNameChange,
    onMidiLoad,
    onExport,
    exportStatus,
    canExport
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

    const handleLoadMidi = () => {
        fileInputRef.current?.click();
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
        // TODO: Implement scene clearing
        console.log('Clear scene functionality to be implemented');
        setShowSceneMenu(false);
    };

    const createNewDefaultScene = () => {
        // TODO: Implement new default scene
        console.log('New default scene functionality to be implemented');
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
                <button className="btn btn-primary" onClick={handleLoadMidi}>
                    📁 Load MIDI
                </button>
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
