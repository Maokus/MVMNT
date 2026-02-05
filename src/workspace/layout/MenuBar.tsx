import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useScene } from '@context/SceneContext';
import logo from '@assets/Logo_Transparent.png'
import { FaSave, FaFolderOpen, FaTrash, FaMagic, FaPen, FaEllipsisV, FaCog } from 'react-icons/fa';
import SceneSettingsModal from './SceneSettingsModal';
import { BrowseTemplatesButton } from '@workspace/templates/BrowseTemplatesButton';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import { useTemplateApply } from '@workspace/templates/useTemplateApply';
import type { TemplateDefinition } from '@workspace/templates/types';

interface MenuBarProps {
    onHelp?: () => void;
}

const MenuBar: React.FC<MenuBarProps> = ({ onHelp }) => {
    const { sceneName, setSceneName, saveScene, loadScene, clearScene, createNewDefaultScene } = useScene();
    const [isEditingName, setIsEditingName] = useState(false);
    // temporary local state while editing so user can clear the input fully
    const [tempSceneName, setTempSceneName] = useState<string>(sceneName || '');
    const [showSceneMenu, setShowSceneMenu] = useState(false);
    const sceneMenuRef = useRef<HTMLDivElement>(null);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const isBetaMode = import.meta.env.VITE_APP_MODE === 'beta';
    const templates = useMemo(() => easyModeTemplates, []);
    const hasTemplates = templates.length > 0;
    const applyTemplate = useTemplateApply();
    const handleBrowseTemplates = useCallback(
        (template: TemplateDefinition) => applyTemplate(template),
        [applyTemplate]
    );

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
        // commit temporary name to store when form submitted (Enter)
        setSceneName(tempSceneName);
        setIsEditingName(false);
    };

    const handleSceneNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // commit on Enter
            setSceneName(tempSceneName);
            setIsEditingName(false);
        } else if (e.key === 'Escape') {
            // revert temporary changes on Escape
            setTempSceneName(sceneName);
            setIsEditingName(false);
        }
    };

    const handleSave = () => { saveScene(); setShowSceneMenu(false); };
    const handleLoad = () => { loadScene(); setShowSceneMenu(false); };
    const handleClear = () => { clearScene(); setShowSceneMenu(false); };
    const handleNew = () => { createNewDefaultScene(); setShowSceneMenu(false); };

    return (
        <>
            <div className="menu-bar">
                <div className="menu-section quick-actions" style={{ gap: 12 }}>
                    <Link to="/" title="Go to Home" style={{ display: 'inline-flex' }}>
                        <img width="50" src={logo} style={{ cursor: 'pointer' }} />
                    </Link>
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
                        <Link
                            to="/easymode"
                            style={{
                                textDecoration: 'none',
                                color: '#ffffff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(191, 191, 191, 0.6)',
                                fontWeight: 600,
                            }}
                            title="Open simplified Easy mode"
                        >Open Easy Mode</Link>
                    </nav>
                </div>

                <div className="menu-section scene-name-section">
                    <div className="scene-name-container">
                        {isEditingName ? (
                            <form onSubmit={handleSceneNameSubmit}>
                                <input
                                    type="text"
                                    className="scene-name-input"
                                    value={tempSceneName}
                                    onChange={(e) => setTempSceneName(e.target.value)}
                                    onBlur={() => {
                                        // commit on blur as well (matches Enter behaviour)
                                        setSceneName(tempSceneName);
                                        setIsEditingName(false);
                                    }}
                                    onKeyDown={handleSceneNameKeyDown}
                                    autoFocus
                                />
                            </form>
                        ) : (
                            <span
                                className="scene-name-display"
                                onDoubleClick={() => { setTempSceneName(sceneName); setIsEditingName(true); }}
                            >
                                {sceneName}
                            </span>
                        )}

                        <button
                            className="bg-transparent border-0 text-neutral-300 cursor-pointer p-1.5 rounded text-sm transition-colors flex items-center justify-center w-7 h-7 hover:bg-white/10 hover:text-white"
                            onClick={() => { setShowSettingsModal(true); setShowSceneMenu(false); }}
                            title="Scene settings"
                            aria-label="Scene settings"
                            type="button"
                        >
                            <FaCog />
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
                        <BrowseTemplatesButton
                            templates={templates}
                            onTemplateSelect={handleBrowseTemplates}
                            className="px-3 py-1 rounded cursor-pointer text-[12px] font-semibold inline-flex items-center justify-center border border-neutral-600 bg-neutral-800/70 text-neutral-100 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                            disabled={!hasTemplates}
                        >
                            Browse Templates
                        </BrowseTemplatesButton>
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-render-modal'))}
                            className="px-3 py-1 rounded cursor-pointer text-[12px] font-semibold shadow-sm inline-flex items-center justify-center bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-pink-400"
                            title="Render / Export Video"
                        >Render</button>
                    </div>
                </div>
            </div>
            {showSettingsModal && <SceneSettingsModal onClose={() => setShowSettingsModal(false)} />}
        </>
    );
};

export default MenuBar;
