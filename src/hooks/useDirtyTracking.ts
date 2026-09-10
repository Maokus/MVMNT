/**
 * Tracks whether the current in-memory state differs from the last explicitly
 * saved version.
 *
 * Strategy
 * --------
 * After a save or a startup load from IndexedDB, `markClean()` records a
 * document revision authority. Persistent command gateways advance the
 * revision after a successful semantic edit; runtime, view, preference, and
 * derived-cache updates do not.
 *
 * Exposing `markClean` lets call-sites (save, startup load) opt into clearing
 * the dirty flag without any special Redux-style action.
 */

import { useCallback } from 'react';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';

export interface DirtyTrackingState {
    isDirty: boolean;
    /** Monotonically increases for each persistent edit while this document is open. */
    dirtyRevision: number;
    /** Capture the authored revision represented by a save snapshot. */
    captureSaveRevision: () => number;
    /** Call after a successful save to IndexedDB or a load from IndexedDB. */
    markClean: () => void;
    /** Mark clean only if no persistent edit happened after the snapshot was captured. */
    markCleanIfRevision: (revision: number) => boolean;
    /** Explicitly mark the scene as dirty (e.g. after loading a template/remix). */
    markDirty: () => void;
}

export function useDirtyTracking(): DirtyTrackingState {
    const revision = useDocumentRevisionStore((state) => state.revision);
    const cleanRevision = useDocumentRevisionStore((state) => state.cleanRevision);
    const markClean = useCallback(() => useDocumentRevisionStore.getState().markClean(), []);
    const markDirty = useCallback(() => useDocumentRevisionStore.getState().markDirty(), []);
    const captureSaveRevision = useCallback(() => useDocumentRevisionStore.getState().captureRevision(), []);
    const markCleanIfRevision = useCallback((savedRevision: number) => {
        const store = useDocumentRevisionStore.getState();
        if (store.revision !== savedRevision) return false;
        store.markClean();
        return true;
    }, []);

    return {
        isDirty: revision !== cleanRevision,
        dirtyRevision: revision,
        captureSaveRevision,
        markClean,
        markCleanIfRevision,
        markDirty,
    };
}
