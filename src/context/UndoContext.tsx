import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { canUndo as actionsCanUndo, canRedo as actionsCanRedo, undo as actionUndo, redo as actionRedo, getDocumentSnapshot, replaceDocument } from '@state/document/actions';

interface UndoContextValue {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    enabled: boolean;
}

const UndoContext = createContext<UndoContextValue | undefined>(undefined);

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const enabled = true;
    const [, forceTick] = useState(0);

    // Subscribe to document store rev to re-render when history changes
    const canUndo = actionsCanUndo();
    const canRedo = actionsCanRedo();
    const undo = actionUndo;
    const redo = actionRedo;
    const reset = (snap: any) => replaceDocument(snap);

    // Global keyboard shortcuts (Cmd/Ctrl+Z and redo variants) mapped to document store
    useEffect(() => {
        if (!enabled) return;
        const handler = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (!meta) return;
            if (e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    if (canRedo) {
                        e.preventDefault();
                        redo();
                        forceTick(t => t + 1);
                    }
                } else {
                    if (canUndo) {
                        e.preventDefault();
                        undo();
                        forceTick(t => t + 1);
                    }
                }
            } else if (e.key.toLowerCase() === 'y') {
                if (canRedo) {
                    e.preventDefault();
                    redo();
                    forceTick(t => t + 1);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled, canUndo, canRedo, undo, redo]);

    const value: UndoContextValue = useMemo(() => ({
        canUndo: !!canUndo,
        canRedo: !!canRedo,
        undo: () => { undo(); forceTick(t => t + 1); },
        redo: () => { redo(); forceTick(t => t + 1); },
        reset: () => { reset(getDocumentSnapshot()); forceTick(t => t + 1); },
        enabled,
    }), [enabled, canUndo, canRedo, undo, redo]);

    return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export function useUndo() {
    const ctx = useContext(UndoContext);
    if (!ctx) throw new Error('useUndo must be used within UndoProvider');
    return ctx;
}
