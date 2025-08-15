import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useScene } from '@context/SceneContext';

const MenuBar: React.FC = () => {
    const { sceneName, setSceneName, saveScene, loadScene, clearScene, createNewDefaultScene } = useScene();
    const [isEditingName, setIsEditingName] = useState(false);
    const [showSceneMenu, setShowSceneMenu] = useState(false);
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

    const handleSave = () => { saveScene(); setShowSceneMenu(false); };
    const handleLoad = () => { loadScene(); setShowSceneMenu(false); };
    const handleClear = () => { clearScene(); setShowSceneMenu(false); };
    const handleNew = () => { createNewDefaultScene(); setShowSceneMenu(false); };

    return (
        <div className="menu-bar">
            <div className="menu-section quick-actions">
                <h3>MVMNT v{((import.meta as any).env?.VITE_VERSION)}</h3>
            </div>

            <div className="menu-section scene-name-section">
                <div className="scene-name-container">
                    {isEditingName ? (
                        <form onSubmit={handleSceneNameSubmit}>
                            <input
                                type="text"
                                className="scene-name-input"
                                value={sceneName}
                                onChange={(e) => setSceneName(e.target.value)}
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
                                <div className="scene-menu-item" onClick={handleSave}>💾 Save Scene (Download JSON)</div>
                                <div className="scene-menu-item" onClick={handleLoad}>📂 Load Scene (Upload JSON)</div>
                                <div className="scene-menu-item" onClick={handleClear}>🗑️ Clear Scene</div>
                                <div className="scene-menu-item" onClick={handleNew}>✨ New Default Scene</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="menu-section" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Link to="/about" title="About Midivis" style={{ display: 'inline-flex' }}>
                    <img width="50" src='/Logo_Transparent.png' style={{ cursor: 'pointer' }} />
                </Link>
            </div>
        </div>
    );
};

export default MenuBar;
