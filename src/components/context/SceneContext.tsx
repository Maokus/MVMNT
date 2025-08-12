import React, { createContext, useContext, useState, useCallback } from 'react';
import { useVisualizer } from './VisualizerContext';
import { useMenuBar } from '../hooks/useMenuBar';
// @ts-ignore
import { SceneNameGenerator } from '../../visualizer/scene-name-generator.js';

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

export const SceneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { visualizer } = useVisualizer();
    const [sceneName, setSceneName] = useState<string>(() => SceneNameGenerator.generate());
    const refreshSceneUI = useCallback(() => { }, []);

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
};

export const useScene = () => {
    const ctx = useContext(SceneContext);
    if (!ctx) throw new Error('useScene must be used within SceneProvider');
    return ctx;
};
