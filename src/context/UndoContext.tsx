import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSnapshotUndoController } from '@persistence/index';
import { instrumentTimelineStoreForUndo } from '@persistence/undo/snapshot-undo';
import { useTimelineStore } from '@state/timelineStore';

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
    const controllerRef = useRef<ReturnType<typeof createSnapshotUndoController> | null>(null);
    const [, forceTick] = useState(0);

    // Initialize controller once when enabled
    useEffect(() => {
        if (!controllerRef.current) {
            // timelineStore is imported; we just pass store reference (not used internally yet but future-proof)
            controllerRef.current = createSnapshotUndoController(useTimelineStore, { maxDepth: 50, debounceMs: 50 });
            try { instrumentTimelineStoreForUndo(); } catch { }
            try { console.debug('[Persistence] UndoProvider controller created (enabled=', enabled, ')'); } catch { }
        }
        // Force a tick so consumers re-read canUndo/canRedo
        const id = setInterval(() => forceTick(t => t + 1), 500); // lightweight polling to update buttons if added later
        return () => clearInterval(id);
    }, [enabled]);

    // Global keyboard shortcuts (Cmd/Ctrl+Z and redo variants)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (!meta) return;
            if (e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    if (controllerRef.current?.canRedo()) {
                        e.preventDefault();
                        controllerRef.current.redo();
                        forceTick(t => t + 1);
                    }
                } else {
                    if (controllerRef.current?.canUndo()) {
                        e.preventDefault();
                        controllerRef.current.undo();
                        forceTick(t => t + 1);
                    }
                }
            } else if (e.key.toLowerCase() === 'y') {
                if (controllerRef.current?.canRedo()) {
                    e.preventDefault();
                    controllerRef.current.redo();
                    forceTick(t => t + 1);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled]);

    const value: UndoContextValue = useMemo(() => ({
        canUndo: !!controllerRef.current?.canUndo(),
        canRedo: !!controllerRef.current?.canRedo(),
        undo: () => { controllerRef.current?.undo(); forceTick(t => t + 1); },
        redo: () => { controllerRef.current?.redo(); forceTick(t => t + 1); },
        reset: () => { controllerRef.current?.reset(); forceTick(t => t + 1); },
        enabled,
    }), [enabled, forceTick]);

    return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export function useUndo() {
    const ctx = useContext(UndoContext);
    if (!ctx) throw new Error('useUndo must be used within UndoProvider');
    return ctx;
}
