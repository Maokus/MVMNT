import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { MacroType, type MacroManager, type Macro } from '@bindings/macro-manager';
import { useVisualizer } from './VisualizerContext';
import { dispatchSceneCommand, useSceneMacros } from '@state/scene';
import type { SceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { ensureMacroSync, getLegacyMacroManager } from '@state/scene/macroSyncService';

type MacroList = ReturnType<typeof useSceneMacros>;

interface MacroContextValue {
    manager: MacroManager;
    macros: MacroList;
    refresh: () => void;
    create: (name: string, type: MacroType, value: any, options?: any) => boolean;
    updateValue: (name: string, value: any) => boolean;
    delete: (name: string) => void;
    get: (name: string) => Macro | null;
    assignListener: (listener: (eventType: string, data: any) => void) => () => void;
}

const MacroContext = createContext<MacroContextValue | undefined>(undefined);

export const MacroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { visualizer } = useVisualizer() as any;
    const storeMacros = useSceneMacros();
    const macros = storeMacros;
    const manager = useMemo(() => {
        ensureMacroSync();
        return getLegacyMacroManager();
    }, []);

    useEffect(() => {
        if (!visualizer || typeof visualizer.invalidateRender !== 'function') return;
        try {
            visualizer.invalidateRender();
        } catch (err) {
            console.warn('[MacroContext] Failed to invalidate visualizer after macro change', err);
        }
    }, [visualizer, macros]);

    const refresh = useCallback(() => {
        // Store-first implementation keeps macros synchronized via command side-effects.
        // The refresh hook remains for compatibility but no longer performs work.
    }, []);

    const runCommand = useCallback((command: SceneCommand, source: string) => {
        const result = dispatchSceneCommand(command, { source });
        if (!result.success) {
            console.warn(`[MacroContext] Command failed (${source})`, result.error);
        }
        return result.success;
    }, []);

    const create = useCallback(
        (name: string, type: MacroType, value: any, options?: any) => {
            const success = runCommand(
                { type: 'createMacro', macroId: name, definition: { type, value, options } },
                'MacroContext.create'
            );
            return success;
        },
        [runCommand]
    );

    const updateValue = useCallback(
        (name: string, value: any) => {
            const success = runCommand({ type: 'updateMacroValue', macroId: name, value }, 'MacroContext.updateValue');
            return success;
        },
        [runCommand]
    );

    const del = useCallback(
        (name: string) => {
            const success = runCommand({ type: 'deleteMacro', macroId: name }, 'MacroContext.delete');
        },
        [runCommand]
    );

    const get = useCallback((name: string): Macro | null => {
        return useSceneStore.getState().macros.byId[name] ?? null;
    }, []);

    const assignListener = useCallback((listener: (eventType: string, data: any) => void) => {
        const unsubscribe = useSceneStore.subscribe((state, prev) => {
            if (state.macros !== prev.macros) {
                listener('macroStoreUpdated', state.macros);
            }
        });
        return unsubscribe;
    }, []);

    return (
        <MacroContext.Provider value={{ manager, macros, refresh, create, updateValue, delete: del, get, assignListener }}>
            {children}
        </MacroContext.Provider>
    );
};

export const useMacros = () => {
    const ctx = useContext(MacroContext);
    if (!ctx) throw new Error('useMacros must be used within MacroProvider');
    return ctx;
};
