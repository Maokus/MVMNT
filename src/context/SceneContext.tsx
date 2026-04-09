import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '@context/useMenuBar';
import { useSceneStore } from '@state/sceneStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { SaveSceneModal } from '@workspace/layout/SaveSceneModal';

interface SceneContextValue {
    sceneName: string;
    setSceneName: (name: string) => void;
    saveScene: () => void;
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

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

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
        onSceneRefresh: refreshSceneUI
    });

    const { saveScene: performSceneSave, loadScene } = menuBarActions;

    const openSaveModal = useCallback(() => {
        setIsSaveModalOpen(true);
    }, []);

    const closeSaveModal = useCallback(() => {
        setIsSaveModalOpen(false);
    }, []);

    const handleConfirmSave = useCallback(
        async (name: string, options: { embedPlugins: boolean }) => {
            const trimmed = name.trim();
            if (!trimmed) {
                return;
            }
            updateSceneName(trimmed);
            try {
                await performSceneSave(trimmed, options);
            } finally {
                closeSaveModal();
            }
        },
        [closeSaveModal, performSceneSave, updateSceneName]
    );

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
                openSaveModal();
            } else if (key === 'o') {
                loadScene();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, [loadScene, openSaveModal]);

    const value: SceneContextValue = {
        sceneName,
        setSceneName: updateSceneName,
        saveScene: openSaveModal,
        loadScene,
        clearScene: menuBarActions.clearScene,
        createNewDefaultScene: menuBarActions.createNewDefaultScene,
        refreshSceneUI
    };
    return (
        <SceneContext.Provider value={value}>
            {children}
            {isSaveModalOpen && (
                <SaveSceneModal
                    initialName={sceneName}
                    onCancel={closeSaveModal}
                    onConfirm={handleConfirmSave}
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
