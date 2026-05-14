import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '@context/useMenuBar';
import { useSceneStore } from '@state/sceneStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SaveSceneModal } from '@workspace/modals/SaveSceneModal';
import { LocalSaveService } from '@persistence/local-save-service';
import { useDirtyTracking } from '@hooks/useDirtyTracking';

interface SceneContextValue {
    sceneName: string;
    setSceneName: (name: string) => void;
    /** Save current state to IndexedDB (Cmd+S). */
    saveToLocal: () => Promise<void>;
    /** Open the export-to-file modal (.mvt download). */
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

    const { loadScene } = menuBarActions;

    // -------------------------------------------------------------------------
    // Local save (IndexedDB)
    // -------------------------------------------------------------------------
    const saveToLocal = useCallback(async () => {
        const result = await LocalSaveService.saveCurrentFile(sceneName);
        if (result.ok) {
            markClean();
        } else {
            console.error('[SceneContext] Local save failed:', result.error);
            alert('Save failed: ' + result.error);
        }
    }, [sceneName, markClean]);

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
            updateSceneName(trimmed);
            useSceneMetadataStore.getState().setDescription(options.description);
            useSceneMetadataStore.getState().setAuthor(options.author);
            try {
                await menuBarActions.saveScene(trimmed, options);
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
            if (key !== 's' && key !== 'o') return;
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
                void saveToLocal();
            } else if (key === 'o') {
                loadScene();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, [loadScene, saveToLocal]);

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
        saveToLocal,
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
