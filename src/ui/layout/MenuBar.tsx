import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useScene } from '@context/SceneContext';
import logo from '@assets/Logo_Transparent.png'
import { FaSave, FaFolderOpen, FaTrash, FaMagic, FaPen, FaEllipsisV } from 'react-icons/fa';

interface MenuBarProps {
    onHelp?: () => void;
    onToggleSidePanels?: () => void;
    onToggleTimeline?: () => void;
    sidePanelsVisible?: boolean;
    timelineVisible?: boolean;
}

const MenuBar: React.FC<MenuBarProps> = ({ onHelp, onToggleSidePanels, onToggleTimeline, sidePanelsVisible, timelineVisible }) => {
    const { sceneName, setSceneName, saveScene, loadScene, clearScene, createNewDefaultScene } = useScene();
    const [isEditingName, setIsEditingName] = useState(false);
    const [showSceneMenu, setShowSceneMenu] = useState(false);
    const sceneMenuRef = useRef<HTMLDivElement>(null);
    const isBetaMode = import.meta.env.VITE_APP_MODE === 'beta';

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
            <div className="menu-section quick-actions" style={{ gap: 12 }}>
                <h3 style={{ marginRight: 0 }}>
                    <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} title="Go to Home">
                        MVMNT v{((import.meta as any).env?.VITE_VERSION)} {isBetaMode ? '(beta)' : ''}
                    </Link>
                </h3>
                <nav style={{ display: 'flex', gap: 10, fontSize: 12 }} aria-label="Utility navigation">
                    <button
                        type="button"
                        onClick={() => onHelp?.()}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#cccccc',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: 4
                        }}
                        title="Show onboarding / help"
                    >help</button>
                    <Link to="/about" style={{ textDecoration: 'none', color: '#cccccc', padding: '4px 6px', borderRadius: 4 }}>about</Link>
                    <Link to="/changelog" style={{ textDecoration: 'none', color: '#cccccc', padding: '4px 6px', borderRadius: 4 }}>changelog</Link>
                </nav>
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
                        className="bg-transparent border-0 text-neutral-300 cursor-pointer p-1 rounded text-xs transition-colors hover:bg-white/10 hover:text-white flex items-center"
                        onClick={() => setIsEditingName(true)}
                        title="Edit scene name"
                        aria-label="Edit scene name"
                    >
                        <FaPen />
                    </button>

                    <div className="relative" ref={sceneMenuRef}>
                        <button
                            className="bg-transparent border-0 text-neutral-300 cursor-pointer p-1.5 rounded text-sm font-bold transition-colors flex items-center justify-center w-6 h-6 hover:bg-white/10 hover:text-white"
                            onClick={() => setShowSceneMenu(!showSceneMenu)}
                            title="Scene options"
                            aria-haspopup="true"
                            aria-expanded={showSceneMenu}
                        >
                            <FaEllipsisV />
                        </button>
                        {showSceneMenu && (
                            <div
                                className={`absolute top-full right-0 border rounded shadow-lg z-[1000] min-w-[180px] mt-1 [background-color:var(--twc-control)] [border-color:#525252] ${showSceneMenu ? 'block' : 'hidden'}`}
                            >
                                <div className="px-3 py-2 text-neutral-300 cursor-pointer transition-colors text-[13px] flex items-center gap-2 hover:bg-white/10 hover:text-white first:rounded-t last:rounded-b" onClick={handleSave}><FaSave /> <span>Save Scene (Download JSON)</span></div>
                                <div className="px-3 py-2 text-neutral-300 cursor-pointer transition-colors text-[13px] flex items-center gap-2 hover:bg-white/10 hover:text-white first:rounded-t last:rounded-b" onClick={handleLoad}><FaFolderOpen /> <span>Load Scene (Upload JSON)</span></div>
                                <div className="px-3 py-2 text-neutral-300 cursor-pointer transition-colors text-[13px] flex items-center gap-2 hover:bg-white/10 hover:text-white first:rounded-t last:rounded-b" onClick={handleClear}><FaTrash /> <span>Clear Scene</span></div>
                                <div className="px-3 py-2 text-neutral-300 cursor-pointer transition-colors text-[13px] flex items-center gap-2 hover:bg-white/10 hover:text-white first:rounded-t last:rounded-b" onClick={handleNew}><FaMagic /> <span>New Default Scene</span></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="menu-section" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <div className="flex items-center gap-2 mr-2">
                    <button
                        type="button"
                        onClick={onToggleSidePanels}
                        className="px-2 py-1 border rounded cursor-pointer text-[12px] font-medium transition inline-flex items-center justify-center bg-neutral-700 border-neutral-600 text-neutral-100 hover:bg-neutral-600 hover:border-neutral-500"
                        title="Show/Hide side panels"
                    >{sidePanelsVisible ? 'Hide Side' : 'Show Side'}</button>
                    <button
                        type="button"
                        onClick={onToggleTimeline}
                        className="px-2 py-1 border rounded cursor-pointer text-[12px] font-medium transition inline-flex items-center justify-center bg-neutral-700 border-neutral-600 text-neutral-100 hover:bg-neutral-600 hover:border-neutral-500"
                        title="Show/Hide timeline panel"
                    >{timelineVisible ? 'Hide Timeline' : 'Show Timeline'}</button>
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-render-modal'))}
                        className="px-3 py-1 rounded cursor-pointer text-[12px] font-semibold shadow-sm inline-flex items-center justify-center bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-pink-400"
                        title="Render / Export Video"
                    >Render</button>
                </div>
                <Link to="/" title="Go to Home" style={{ display: 'inline-flex' }}>
                    <img width="50" src={logo} style={{ cursor: 'pointer' }} />
                </Link>
            </div>
        </div>
    );
};

export default MenuBar;
