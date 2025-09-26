import React, { createContext, useContext, useEffect, useCallback } from 'react';
// @ts-ignore
import { globalMacroManager, MacroType } from '@bindings/macro-manager';
import { useVisualizer } from './VisualizerContext';
import { dispatchSceneCommand, synchronizeSceneStoreFromBuilder, useSceneMacros } from '@state/scene';
import type { SceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

interface MacroContextValue {
    manager: any;
    macros: any[];
    refresh: () => void;
    create: (name: string, type: MacroType, value: any, options?: any) => boolean;
    updateValue: (name: string, value: any) => boolean;
    delete: (name: string) => void;
    get: (name: string) => any;
    assignListener: (listener: (eventType: string, data: any) => void) => () => void;
}

const MacroContext = createContext<MacroContextValue | undefined>(undefined);

export const MacroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { visualizer } = useVisualizer() as any;
    const storeMacros = useSceneMacros();
    const macros = storeMacros;

    useEffect(() => {
        if (!visualizer || typeof visualizer.invalidateRender !== 'function') return;
        try {
            visualizer.invalidateRender();
        } catch (err) {
            console.warn('[MacroContext] Failed to invalidate visualizer after macro change', err);
        }
    }, [visualizer, macros]);

    const getSceneBuilder = useCallback(() => {
        if (!visualizer) return null;
        try {
            return visualizer.getSceneBuilder?.() ?? null;
        } catch {
            return null;
        }
    }, [visualizer]);

    const refresh = useCallback(() => {
        const builder = getSceneBuilder();
        if (builder) {
            synchronizeSceneStoreFromBuilder(builder, { source: 'MacroContext.refresh', skipParity: true });
        }
    }, [getSceneBuilder]);

    const runCommand = useCallback(
        (command: SceneCommand, source: string) => {
            const builder = getSceneBuilder();
            if (builder) {
                const result = dispatchSceneCommand(builder, command, { source, forceParity: false, skipParity: false });
                if (!result.success) {
                    console.warn(`[MacroContext] Command failed (${source})`, result.error);
                }
                return result.success;
            }
            return false;
        },
        [getSceneBuilder]
    );

    const create = useCallback(
        (name: string, type: MacroType, value: any, options?: any) => {
            const success = runCommand(
                { type: 'createMacro', macroId: name, definition: { type, value, options } },
                'MacroContext.create'
            );
            if (!success && !getSceneBuilder()) {
                useSceneStore.getState().createMacro(name, { type, value, options });
                globalMacroManager.createMacro(name, type as MacroType, value, options);
                return true;
            }
            return success;
        },
        [runCommand, getSceneBuilder]
    );

    const updateValue = useCallback(
        (name: string, value: any) => {
            const success = runCommand({ type: 'updateMacroValue', macroId: name, value }, 'MacroContext.updateValue');
            if (!success && !getSceneBuilder()) {
                useSceneStore.getState().updateMacroValue(name, value);
                globalMacroManager.updateMacroValue(name, value);
                return true;
            }
            return success;
        },
        [runCommand, getSceneBuilder]
    );

    const del = useCallback(
        (name: string) => {
            const success = runCommand({ type: 'deleteMacro', macroId: name }, 'MacroContext.delete');
            if (!success && !getSceneBuilder()) {
                useSceneStore.getState().deleteMacro(name);
                globalMacroManager.deleteMacro(name);
            }
        },
        [runCommand, getSceneBuilder]
    );

    const get = useCallback((name: string) => {
        return useSceneStore.getState().macros.byId[name] ?? null;
    }, []);

    const assignListener = useCallback((listener: (eventType: string, data: any) => void) => {
        const unsubscribe = useSceneStore.subscribe(
            (state) => listener('macroStoreUpdated', state.macros),
            (state) => state.macros,
            (a, b) => a === b
        );
        return unsubscribe;
    }, []);

    return (
        <MacroContext.Provider value={{ manager: globalMacroManager, macros, refresh, create, updateValue, delete: del, get, assignListener }}>
            {children}
        </MacroContext.Provider>
    );
};

export const useMacros = () => {
    const ctx = useContext(MacroContext);
    if (!ctx) throw new Error('useMacros must be used within MacroProvider');
    return ctx;
};
