import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
// @ts-ignore
import { globalMacroManager, MacroType } from '@bindings/macro-manager';

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
    const [macros, setMacros] = useState<any[]>(() => globalMacroManager.getAllMacros());

    const refresh = useCallback(() => {
        setMacros(globalMacroManager.getAllMacros());
    }, []);

    // Auto-refresh on macro events
    useEffect(() => {
        const listener = () => refresh();
        globalMacroManager.addListener(listener);
        return () => globalMacroManager.removeListener(listener);
    }, [refresh]);

    const create = (name: string, type: MacroType, value: any, options?: any) => {
        const ok = globalMacroManager.createMacro(name, type as MacroType, value, options);
        if (ok) refresh();
        return ok;
    };
    const updateValue = (name: string, value: any) => {
        const ok = globalMacroManager.updateMacroValue(name, value);
        if (ok) refresh();
        return ok;
    };
    const del = (name: string) => {
        globalMacroManager.deleteMacro(name);
        refresh();
    };
    const get = (name: string) => globalMacroManager.getMacro(name);
    const assignListener = (listener: (eventType: string, data: any) => void) => {
        globalMacroManager.addListener(listener);
        return () => globalMacroManager.removeListener(listener);
    };

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
