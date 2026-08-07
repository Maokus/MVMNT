import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPatchUndoController } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { isTextEditingTarget, useGlobalShortcut } from './shortcuts/shortcutRegistry';

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
    const enabled = true; // persistence always enabled
    const controllerRef = useRef<ReturnType<typeof createPatchUndoController> | null>(null);
    const [, forceTick] = useState(0);

    // Initialize controller once when enabled
    useEffect(() => {
        if (!controllerRef.current) {
            // timelineStore is imported; we just pass store reference (not used internally yet but future-proof)
            controllerRef.current = createPatchUndoController(useTimelineStore, { maxDepth: 50 });
            try {
                console.debug('[Persistence] UndoProvider controller created (enabled=', enabled, ')');
            } catch {}
        }
        // Force a tick so consumers re-read canUndo/canRedo
        const id = setInterval(() => forceTick((t) => t + 1), 500); // lightweight polling to update buttons if added later
        return () => {
            clearInterval(id);
            controllerRef.current?.dispose();
            controllerRef.current = null;
        };
    }, [enabled]);

    useGlobalShortcut({
        id: 'undo.history',
        domain: 'undo',
        matches: (event) =>
            (event.metaKey || event.ctrlKey) &&
            !isTextEditingTarget(event.target) &&
            ['z', 'y'].includes(event.key.toLowerCase()),
        handle: (event) => {
            const redo = event.key.toLowerCase() === 'y' || event.shiftKey;
            const controller = controllerRef.current;
            if (!controller || (redo ? !controller.canRedo() : !controller.canUndo())) return false;
            event.preventDefault();
            if (redo) controller.redo();
            else controller.undo();
            forceTick((tick) => tick + 1);
            window.dispatchEvent(new CustomEvent('mvmnt-undo-applied'));
            return true;
        },
    });

    const value: UndoContextValue = useMemo(
        () => ({
            canUndo: !!controllerRef.current?.canUndo(),
            canRedo: !!controllerRef.current?.canRedo(),
            undo: () => {
                controllerRef.current?.undo();
                forceTick((t) => t + 1);
                window.dispatchEvent(new CustomEvent('mvmnt-undo-applied'));
            },
            redo: () => {
                controllerRef.current?.redo();
                forceTick((t) => t + 1);
                window.dispatchEvent(new CustomEvent('mvmnt-undo-applied'));
            },
            reset: () => {
                controllerRef.current?.reset();
                forceTick((t) => t + 1);
            },
            enabled,
        }),
        [enabled, forceTick]
    );

    return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export function useUndo() {
    const ctx = useContext(UndoContext);
    if (!ctx) throw new Error('useUndo must be used within UndoProvider');
    return ctx;
}
