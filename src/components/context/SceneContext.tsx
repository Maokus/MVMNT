import React, { createContext, useContext, useState, useCallback } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '../hooks/useMenuBar';
import { SceneNameGenerator } from '../../visualizer/scene-name-generator';

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

    // Dispatch window events to notify all components about scene changes
    const refreshSceneUI = useCallback(() => {
        // Dispatch scene-refresh event for SceneSelectionContext to pick up
        window.dispatchEvent(new CustomEvent('scene-refresh'));
    }, []);

    const menuBarActions = useMenuBar({
        visualizer,
        sceneName,
        onSceneNameChange: setSceneName,
        onSceneRefresh: refreshSceneUI
    });

    const value: SceneContextValue = {
        sceneName,
        setSceneName,
        saveScene: menuBarActions.saveScene,
        loadScene: menuBarActions.loadScene,
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
