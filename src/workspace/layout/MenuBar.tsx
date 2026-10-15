import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useScene } from '@context/SceneContext';
import logo from '@assets/Logo_Transparent.png';
import { FaCog } from 'react-icons/fa';
import SceneSettingsModal from '@workspace/modals/SceneSettingsModal';
import { BrowseTemplatesButton } from '@workspace/templates/BrowseTemplatesButton';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import { useTemplateApply } from '@workspace/templates/useTemplateApply';
import type { TemplateDefinition } from '@workspace/templates/types';
import { matchesShortcut, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { BUILD_INFO } from '@app/build-info';
import { Button } from '@workspace/components/Button';
import { useDocumentSaveStatusStore } from '@state/documentSaveStatusStore';
import { useWorkspacePanelsStore, WORKSPACE_PANEL_IDS, WORKSPACE_PANEL_LABELS } from '@state/workspacePanelsStore';

const DEFAULT_DOCUMENT_TITLE = 'MVMNT – Interactive MIDI Visualizer';

export function DocumentSaveStatus() {
    const { phase, progress, message, details, queued } = useDocumentSaveStatusStore((state) => ({
        phase: state.phase,
        progress: state.progress,
        message: state.message,
        details: state.details,
        queued: state.queued,
    }));
    if (phase === 'idle') return null;

    const tone =
        phase === 'error'
            ? 'border-red-800 bg-red-950 text-red-200'
            : phase === 'warning'
              ? 'border-amber-800 bg-amber-950 text-amber-200'
              : 'border-neutral-800 bg-neutral-800 text-neutral-200';
    const label = queued && phase === 'saving' ? `${message} · latest queued` : message;

    return (
        <div
            className={`relative max-w-52 overflow-hidden rounded border px-2 py-1 text-[11px] leading-none ${tone}`}
            role="status"
            aria-live="polite"
            title={details.length > 0 ? details.join('\n') : label}
        >
            <span className="block truncate">{label}</span>
            {phase === 'saving' && typeof progress === 'number' ? (
                <span
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-700"
                    role="progressbar"
                    aria-label="Project save progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                >
                    <span className="block h-full bg-sky-400" style={{ width: `${progress * 100}%` }} />
                </span>
            ) : null}
        </div>
    );
}

const MenuBar: React.FC = () => {
    const { sceneName, renameScene, isDirty, leaveWorkspace } = useScene();
    const navigate = useNavigate();
    const [isEditingName, setIsEditingName] = useState(false);
    // temporary local state while editing so user can clear the input fully
    const [tempSceneName, setTempSceneName] = useState<string>(sceneName || '');
    const [showBrand, setShowBrand] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const templates = useMemo(() => easyModeTemplates, []);
    const hasTemplates = templates.length > 0;
    const applyTemplate = useTemplateApply();

    const hidden = useWorkspacePanelsStore((state) => state.hidden);
    const togglePanel = useWorkspacePanelsStore((state) => state.toggle);

    const handleBrowseTemplates = useCallback(
        (template: TemplateDefinition) => applyTemplate(template),
        [applyTemplate]
    );

    // The window/document title tracks the project name; the native menu no longer owns it.
    useEffect(() => {
        document.title = `${isDirty ? '● ' : ''}${sceneName || 'Untitled'} — MVMNT`;
    }, [sceneName, isDirty]);
    useEffect(
        () => () => {
            document.title = DEFAULT_DOCUMENT_TITLE;
        },
        []
    );

    useGlobalShortcut({
        id: 'document.scene-settings',
        domain: 'document',
        matches: (event) => matchesShortcut(event, { key: ',', primary: true }),
        handle: (event) => {
            event.preventDefault();
            setShowSettingsModal(true);
            return true;
        },
    });

    const handleSceneNameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // commit temporary name to store when form submitted (Enter)
        void renameScene(tempSceneName);
        setIsEditingName(false);
    };

    const handleSceneNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            void renameScene(tempSceneName);
            setIsEditingName(false);
        } else if (e.key === 'Escape') {
            setTempSceneName(sceneName);
            setIsEditingName(false);
        }
    };

    const handleGoHome = async (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        if (await leaveWorkspace()) navigate('/');
    };

    const brandOpen = showBrand || isEditingName;

    return (
        <>
            <div className="menu-bar">
                <div className="menu-section quick-actions" style={{ gap: 12 }}>
                    <div
                        className="relative"
                        onMouseEnter={() => setShowBrand(true)}
                        onMouseLeave={() => {
                            if (!isEditingName) setShowBrand(false);
                        }}
                    >
                        <Link to="/" onClick={handleGoHome} title="Go to Home" style={{ display: 'inline-flex' }}>
                            <img width="40" src={logo} style={{ cursor: 'pointer' }} alt="MVMNT" />
                        </Link>
                        {brandOpen && (
                            <div
                                className="absolute left-0 top-full z-[1100] mt-2 min-w-[200px] rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-100 shadow-lg"
                                role="dialog"
                                aria-label="Project"
                            >
                                <div className="mb-2 text-xs font-medium text-neutral-300">
                                    MVMNT <span className="text-neutral-500">v{BUILD_INFO.displayVersion}</span>
                                </div>
                                {isEditingName ? (
                                    <form onSubmit={handleSceneNameSubmit}>
                                        <input
                                            type="text"
                                            className="scene-name-input"
                                            value={tempSceneName}
                                            onChange={(e) => setTempSceneName(e.target.value)}
                                            onBlur={() => {
                                                void renameScene(tempSceneName);
                                                setIsEditingName(false);
                                            }}
                                            onKeyDown={handleSceneNameKeyDown}
                                            aria-label="Project name"
                                            autoFocus
                                        />
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        className="scene-name-display"
                                        title="Double-click to rename the project"
                                        onDoubleClick={() => {
                                            setTempSceneName(sceneName);
                                            setIsEditingName(true);
                                        }}
                                    >
                                        {sceneName}
                                        {isDirty ? (
                                            <span title="Unsaved changes" style={{ marginLeft: 2, opacity: 0.7 }}>
                                                *
                                            </span>
                                        ) : null}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <nav className="flex items-center gap-1" aria-label="Workspace panels">
                        {WORKSPACE_PANEL_IDS.map((id) => {
                            const visible = !hidden[id];
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => togglePanel(id)}
                                    aria-pressed={visible}
                                    title={`${visible ? 'Hide' : 'Show'} ${WORKSPACE_PANEL_LABELS[id]} panel`}
                                    className={`rounded px-2.5 py-1 text-[12px] font-semibold transition-colors outline-none focus:outline-none ${
                                        visible
                                            ? 'bg-neutral-700 text-white'
                                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                                    }`}
                                >
                                    {WORKSPACE_PANEL_LABELS[id]}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="menu-section" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <DocumentSaveStatus />
                    <Button
                        variant="icon-lg"
                        onClick={() => setShowSettingsModal(true)}
                        title="Scene settings"
                        aria-label="Scene settings"
                    >
                        <FaCog size={16} />
                    </Button>
                    <BrowseTemplatesButton
                        templates={templates}
                        onTemplateSelect={handleBrowseTemplates}
                        className="px-3 py-1 rounded cursor-pointer text-[12px] font-semibold inline-flex items-center justify-center border border-neutral-800 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 focus:outline-none"
                        disabled={!hasTemplates}
                    >
                        Browse Templates
                    </BrowseTemplatesButton>
                    <Button
                        variant="primary"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-render-modal'))}
                        data-tutorial-target="render"
                        title="Render / Export Video"
                    >
                        Render
                    </Button>
                </div>
            </div>
            {showSettingsModal && <SceneSettingsModal onClose={() => setShowSettingsModal(false)} />}
        </>
    );
};

export default MenuBar;
