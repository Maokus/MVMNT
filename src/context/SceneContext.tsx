import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '@context/useMenuBar';
import { useSceneStore } from '@state/sceneStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SaveSceneModal } from '@workspace/modals/SaveSceneModal';
import { LocalSaveService } from '@persistence/local-save-service';
import { LocalFileStore } from '@persistence/local-file-store';
import { useDirtyTracking } from '@hooks/useDirtyTracking';
import { useTemplateStatusStore } from '@state/templateStatusStore';

interface SceneContextValue {
    sceneName: string;
    /** Used by import/template hydration; user initiated renames use renameScene. */
    setSceneName: (name: string) => void;
    /** Rename the scene title and, for saved desktop projects, its file atomically. */
    renameScene: (name: string) => Promise<boolean>;
    /** Save to the native project path. */
    saveToLocal: () => Promise<void>;
    /** Save the current project to a newly selected path. */
    saveAs: () => Promise<void>;
    /** Open project metadata and Save As options. */
    exportAsFile: () => void;
    /** Whether the in-memory state differs from the last IndexedDB save. */
    isDirty: boolean;
    /** Signal that the current state matches the IndexedDB copy (called after save/load). */
    markSaveClean: () => void;
    /** Explicitly mark the scene as dirty (called after loading a template/remix). */
    markDirty: () => void;
    loadScene: () => void;
    clearScene: () => void;
    createNewDefaultScene: () => void;
    /** Resolve unsaved changes and close the active document before leaving the editor. */
    leaveWorkspace: () => Promise<boolean>;
    refreshSceneUI: () => void;
}

const SceneContext = createContext<SceneContextValue | undefined>(undefined);

export function SceneProvider({ children }: { children: React.ReactNode }) {
    const { visualizer } = useVisualizer();
    const sceneName = useSceneMetadataStore((state) => state.metadata.name);
    const setSceneName = useSceneMetadataStore((state) => state.setName);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isLeavePromptOpen, setIsLeavePromptOpen] = useState(false);
    const leaveDecisionResolver = useRef<((decision: 'save' | 'discard' | 'cancel') => void) | null>(null);

    const { isDirty, markClean, markDirty } = useDirtyTracking();

    useEffect(() => {
        try {
            window.dispatchEvent(new CustomEvent('scene-name-changed', { detail: { sceneName } }));
        } catch {
            /* no-op in non-browser environments */
        }
    }, [sceneName]);

    const updateSceneName = useCallback(
        (name: string) => {
            setSceneName(name);
        },
        [setSceneName]
    );

    const renameScene = useCallback(
        async (value: string): Promise<boolean> => {
            const name = value.trim();
            if (!name || name === sceneName) return name === sceneName;
            if (/[\\/:*?"<>|]/.test(name) || /[\u0000-\u001f]/.test(name) || /\.$/.test(name)) {
                alert(
                    'Scene names must be valid filenames and cannot contain \\ / : * ? " < > |, control characters, or end with a period.'
                );
                return false;
            }
            if (window.mvmntDesktop) {
                const state = await window.mvmntDesktop.documents.getState();
                if (state.status === 'saved') {
                    const ok = window.confirm(`Rename the scene and its file to “${name}.mvt”?`);
                    if (!ok) return false;
                    const result = await window.mvmntDesktop.documents.rename({ filename: `${name}.mvt` });
                    if (result.status !== 'renamed') {
                        if (result.status === 'error')
                            alert(`Could not rename project: ${result.error || 'Unknown error'}`);
                        return false;
                    }
                }
            }
            updateSceneName(name);
            return true;
        },
        [sceneName, updateSceneName]
    );

    // Bump the store runtime metadata to notify all components about scene changes
    const refreshSceneUI = useCallback(() => {
        useSceneStore.setState((prev) => ({
            runtimeMeta: {
                ...prev.runtimeMeta,
                lastMutatedAt: Date.now(),
            },
        }));
    }, []);

    const menuBarActions = useMenuBar({
        visualizer,
        sceneName,
        onSceneNameChange: updateSceneName,
        onSceneRefresh: refreshSceneUI,
        isDirty,
        markSaveClean: markClean,
        markDirty,
    });

    const { loadScene, openDesktopFile } = menuBarActions;

    // -------------------------------------------------------------------------
    // Native project save
    // -------------------------------------------------------------------------
    const saveToLocal = useCallback(async () => {
        await menuBarActions.saveProject(false);
    }, [menuBarActions]);

    const saveAs = useCallback(async () => {
        await menuBarActions.saveProject(true);
    }, [menuBarActions]);

    // Expose markClean so TemplateInitializer can call it after loading from IDB
    const markSaveClean = markClean;

    const chooseLeaveDecision = useCallback((decision: 'save' | 'discard' | 'cancel') => {
        setIsLeavePromptOpen(false);
        leaveDecisionResolver.current?.(decision);
        leaveDecisionResolver.current = null;
    }, []);

    useEffect(() => {
        if (!isLeavePromptOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            chooseLeaveDecision('cancel');
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [chooseLeaveDecision, isLeavePromptOpen]);

    const leaveWorkspace = useCallback(async (): Promise<boolean> => {
        if (isDirty) {
            const decision = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
                leaveDecisionResolver.current = resolve;
                setIsLeavePromptOpen(true);
            });
            if (decision === 'cancel') return false;
            if (decision === 'save') {
                const saved = await menuBarActions.saveProject(false);
                if (!saved) return false;
            }
        }

        // Returning home closes the editor document. Do not let recovery state
        // silently reopen it the next time the workspace is entered.
        await LocalFileStore.clear().catch(() => undefined);
        await window.mvmntDesktop?.documents.clearActivePath();
        localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
        markClean();
        return true;
    }, [isDirty, markClean, menuBarActions]);

    // -------------------------------------------------------------------------
    // Export to file (download .mvt)
    // -------------------------------------------------------------------------
    const openExportModal = useCallback(() => {
        setIsExportModalOpen(true);
    }, []);

    const closeExportModal = useCallback(() => {
        setIsExportModalOpen(false);
    }, []);

    const handleConfirmExport = useCallback(
        async (name: string, options: { embedPlugins: boolean; description: string; author: string }) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            if (/[\\/:*?"<>|]/.test(trimmed) || /[\u0000-\u001f]/.test(trimmed) || /\.$/.test(trimmed)) {
                alert(
                    'Scene names must be valid filenames and cannot contain \\ / : * ? " < > |, control characters, or end with a period.'
                );
                return;
            }
            updateSceneName(trimmed);
            useSceneMetadataStore.getState().setDescription(options.description);
            useSceneMetadataStore.getState().setAuthor(options.author);
            try {
                await menuBarActions.saveProject(true);
            } finally {
                closeExportModal();
            }
        },
        [closeExportModal, menuBarActions, updateSceneName]
    );

    // -------------------------------------------------------------------------
    // Keyboard shortcuts
    // -------------------------------------------------------------------------
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const key = event.key.toLowerCase();
            if (key !== 's' && key !== 'o' && key !== 'n') return;
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            const isEditable = !!(
                target &&
                (target.isContentEditable ||
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    target.getAttribute?.('role') === 'textbox')
            );
            if (isEditable) return;
            event.preventDefault();
            if (key === 's') {
                if (event.shiftKey) void saveAs();
                else void saveToLocal();
            } else if (key === 'o') {
                loadScene();
            } else if (key === 'n') {
                menuBarActions.createNewDefaultScene();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, [loadScene, menuBarActions, saveAs, saveToLocal]);

    // -------------------------------------------------------------------------
    // Electron desktop bridge
    // -------------------------------------------------------------------------
    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        desktop.documents.setDirty(isDirty);
    }, [isDirty]);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        return desktop.documents.onOpenPathRequest((result) => {
            void openDesktopFile(result);
        });
    }, [openDesktopFile]);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        return desktop.menu.onCommand((command) => {
            if (command === 'new') menuBarActions.createNewDefaultScene();
            if (command === 'open') loadScene();
            if (command === 'save') void saveToLocal();
            if (command === 'save-as') void saveAs();
        });
    }, [loadScene, menuBarActions, saveAs, saveToLocal]);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        return desktop.lifecycle.onCloseRequest(() => {
            void menuBarActions.saveProject(false).then((saved) => {
                desktop.lifecycle.completeCloseRequest(saved ? 'saved' : 'canceled');
            });
        });
    }, [menuBarActions]);

    useEffect(() => {
        if (!window.mvmntDesktop || !isDirty) return;
        localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
        let saving = false;
        const saveRecovery = async () => {
            if (saving) return;
            saving = true;
            try {
                await LocalSaveService.saveCurrentFile(sceneName);
            } finally {
                saving = false;
            }
        };
        const initial = window.setTimeout(() => void saveRecovery(), 5_000);
        const recurring = window.setInterval(() => void saveRecovery(), 30_000);
        return () => {
            window.clearTimeout(initial);
            window.clearInterval(recurring);
        };
    }, [isDirty, sceneName]);

    // -------------------------------------------------------------------------
    // Warn before leaving with unsaved changes
    // -------------------------------------------------------------------------
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (!isDirty) return;
            event.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const value: SceneContextValue = {
        sceneName,
        setSceneName: updateSceneName,
        renameScene,
        saveToLocal,
        saveAs,
        exportAsFile: openExportModal,
        isDirty,
        markSaveClean,
        markDirty,
        loadScene,
        clearScene: menuBarActions.clearScene,
        createNewDefaultScene: menuBarActions.createNewDefaultScene,
        leaveWorkspace,
        refreshSceneUI,
    };

    return (
        <SceneContext.Provider value={value}>
            {children}
            {isExportModalOpen && (
                <SaveSceneModal initialName={sceneName} onCancel={closeExportModal} onConfirm={handleConfirmExport} />
            )}
            {isLeavePromptOpen && (
                <div
                    className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="leave-workspace-title"
                >
                    <div className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl">
                        <h2 id="leave-workspace-title" className="text-base font-semibold">
                            Save changes?
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                            Your current scene has unsaved changes. Save them before leaving the workspace?
                        </p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => chooseLeaveDecision('discard')}
                                className="rounded bg-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-600"
                            >
                                Don’t save
                            </button>
                            <button
                                type="button"
                                onClick={() => chooseLeaveDecision('cancel')}
                                className="rounded bg-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-600"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => chooseLeaveDecision('save')}
                                className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SceneContext.Provider>
    );
}

export const useScene = () => {
    const ctx = useContext(SceneContext);
    if (!ctx) throw new Error('useScene must be used within SceneProvider');
    return ctx;
};
