import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '@context/useMenuBar';
import { useSceneStore } from '@state/sceneStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SaveSceneModal } from '@workspace/modals/SaveSceneModal';
import { LocalSaveService } from '@persistence/local-save-service';
import { useDirtyTracking } from '@hooks/useDirtyTracking';
import { useTemplateStatusStore } from '@state/templateStatusStore';

interface SceneContextValue {
    sceneName: string;
    /** Used by import/template hydration; user initiated renames use renameScene. */
    setSceneName: (name: string) => void;
    /** Rename the scene title and, for saved desktop projects, its file atomically. */
    renameScene: (name: string) => Promise<boolean>;
    /** Save to the native project path, with IndexedDB fallback outside Electron. */
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
    refreshSceneUI: () => void;
}

const SceneContext = createContext<SceneContextValue | undefined>(undefined);

export function SceneProvider({ children }: { children: React.ReactNode }) {
    const { visualizer } = useVisualizer();
    const sceneName = useSceneMetadataStore((state) => state.metadata.name);
    const setSceneName = useSceneMetadataStore((state) => state.setName);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const { isDirty, markClean, markDirty } = useDirtyTracking();
    const startFileLoading = useTemplateStatusStore((state) => state.startLoading);
    const updateFileLoading = useTemplateStatusStore((state) => state.updateLoading);
    const finishFileLoading = useTemplateStatusStore((state) => state.finishLoading);

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

    const renameScene = useCallback(async (value: string): Promise<boolean> => {
        const name = value.trim();
        if (!name || name === sceneName) return name === sceneName;
        if (/[\\/:*?"<>|]/.test(name) || /[\u0000-\u001f]/.test(name) || /\.$/.test(name)) {
            alert('Scene names must be valid filenames and cannot contain \\ / : * ? " < > |, control characters, or end with a period.');
            return false;
        }
        if (window.mvmntDesktop) {
            const state = await window.mvmntDesktop.documents.getState();
            if (state.status === 'saved') {
                const ok = window.confirm(`Rename the scene and its file to “${name}.mvt”?`);
                if (!ok) return false;
                const result = await window.mvmntDesktop.documents.rename({ filename: `${name}.mvt` });
                if (result.status !== 'renamed') {
                    if (result.status === 'error') alert(`Could not rename project: ${result.error || 'Unknown error'}`);
                    return false;
                }
            }
        }
        updateSceneName(name);
        return true;
    }, [sceneName, updateSceneName]);

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
    // Local save (IndexedDB)
    // -------------------------------------------------------------------------
    const saveToLocal = useCallback(async () => {
        if (window.mvmntDesktop) {
            await menuBarActions.saveProject(false);
            return;
        }
        startFileLoading(`Saving ${sceneName || 'scene'}…`, { progress: 0 });
        try {
            const result = await LocalSaveService.saveCurrentFile(sceneName, {
                onProgress: (progress, message) => updateFileLoading({ progress, message }),
            });
            if (result.ok) {
                markClean();
            } else if (result.fallbackToFileExport) {
                // Some browsers expose IndexedDB but prohibit writes (for
                // example, Firefox private browsing). Preserve the user's
                // work with the same durable file export used by the menu.
                console.warn('[SceneContext] Local save unavailable; exporting scene as a file instead:', result.error);
                alert('Local saving is unavailable in this browser session. Your scene will be exported as a file instead.');
                await menuBarActions.saveScene(sceneName);
            } else {
                console.error('[SceneContext] Local save failed:', result.error);
                alert('Save failed: ' + result.error);
            }
        } finally {
            finishFileLoading();
        }
    }, [finishFileLoading, markClean, menuBarActions, sceneName, startFileLoading, updateFileLoading]);

    const saveAs = useCallback(async () => {
        await menuBarActions.saveProject(true);
    }, [menuBarActions]);

    // Expose markClean so TemplateInitializer can call it after loading from IDB
    const markSaveClean = markClean;

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
                alert('Scene names must be valid filenames and cannot contain \\ / : * ? " < > |, control characters, or end with a period.');
                return;
            }
            updateSceneName(trimmed);
            useSceneMetadataStore.getState().setDescription(options.description);
            useSceneMetadataStore.getState().setAuthor(options.author);
            try {
                await menuBarActions.saveScene(trimmed, { ...options, forceSaveAs: true });
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
                if (event.shiftKey) openExportModal();
                else void saveToLocal();
            } else if (key === 'o') {
                loadScene();
            } else if (key === 'n') {
                menuBarActions.createNewDefaultScene();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, [loadScene, menuBarActions, openExportModal, saveToLocal]);

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
            if (command === 'save-as') openExportModal();
        });
    }, [loadScene, menuBarActions, openExportModal, saveToLocal]);

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
        refreshSceneUI,
    };

    return (
        <SceneContext.Provider value={value}>
            {children}
            {isExportModalOpen && (
                <SaveSceneModal
                    initialName={sceneName}
                    onCancel={closeExportModal}
                    onConfirm={handleConfirmExport}
                />
            )}
        </SceneContext.Provider>
    );
}

export const useScene = () => {
    const ctx = useContext(SceneContext);
    if (!ctx) throw new Error('useScene must be used within SceneProvider');
    return ctx;
};
