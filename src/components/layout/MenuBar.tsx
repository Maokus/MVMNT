import React, { useState, useRef, useEffect } from 'react';

interface MenuBarActions {
    saveScene: () => void;
    loadScene: () => void;
    clearScene: () => void;
    createNewDefaultScene: () => void;
}

interface MenuBarProps {
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onMidiLoad: (file: File) => void;
    menuBarActions: MenuBarActions;
}

const MenuBar: React.FC<MenuBarProps> = ({
    sceneName,
    onSceneNameChange,
    onMidiLoad,
    menuBarActions
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
        menuBarActions.saveScene();
        setShowSceneMenu(false);
    };

    const loadScene = () => {
        menuBarActions.loadScene();
        setShowSceneMenu(false);
    };

    const clearScene = () => {
        menuBarActions.clearScene();
        setShowSceneMenu(false);
    };

    const createNewDefaultScene = () => {
        menuBarActions.createNewDefaultScene();
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
                <h3>Midivis v{process.env.REACT_APP_VERSION}</h3>
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
                                <div className="scene-menu-item" onClick={saveScene}>💾 Save Scene (Download JSON)</div>
                                <div className="scene-menu-item" onClick={loadScene}>📂 Load Scene (Upload JSON)</div>
                                <div className="scene-menu-item" onClick={clearScene}>🗑️ Clear All Layers</div>
                                <div className="scene-menu-item" onClick={createNewDefaultScene}>✨ New Default Scene</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MenuBar;
