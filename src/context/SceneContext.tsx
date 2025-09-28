import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '@context/useMenuBar';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useSceneStore } from '@state/sceneStore';

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
    const [sceneName, setSceneName] = useState<string>(() => SceneNameGenerator.generate());

    useEffect(() => {
        try {
            window.dispatchEvent(new CustomEvent('scene-name-changed', { detail: { sceneName } }));
        } catch {
            /* no-op in non-browser environments */
        }
    }, [sceneName]);

    const updateSceneName = useCallback((name: string) => {
        setSceneName(name);
    }, []);

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

    const { saveScene, loadScene } = menuBarActions;

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
                saveScene();
            } else if (key === 'o') {
                loadScene();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, [loadScene, saveScene]);

    const value: SceneContextValue = {
        sceneName,
        setSceneName: updateSceneName,
        saveScene,
        loadScene,
        clearScene: menuBarActions.clearScene,
        createNewDefaultScene: menuBarActions.createNewDefaultScene,
        refreshSceneUI
    };
    return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export const useScene = () => {
    const ctx = useContext(SceneContext);
    if (!ctx) throw new Error('useScene must be used within SceneProvider');
    return ctx;
};
