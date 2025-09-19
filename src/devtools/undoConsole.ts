// Phase P0 minimal console helpers. Will expand in later phases.
// Ensures window.__undoDebug exists with dumpDoc() and hist().
import { getDocumentSnapshot, canUndo, canRedo, setHistoryLogger } from '@state/document/actions';
import { useDocumentStore } from '@state/document/documentStore';

function install() {
    if (typeof window === 'undefined') return;
    const w: any = window as any;
    w.__undoDebug = w.__undoDebug || {};
    if (!w.__undoDebug.dumpDoc) {
        w.__undoDebug.dumpDoc = () => getDocumentSnapshot();
    }
    if (!w.__undoDebug.hist) {
        w.__undoDebug.hist = () => {
            // Access store internals indirectly by diffing rev counters
            const state = useDocumentStore.getState();
            // We don't expose patches yet; only lengths via flags
            return {
                canUndo: canUndo(),
                canRedo: canRedo(),
                rev: state.rev,
            };
        };
    }
    if (!w.__undoDebug._loggerInstalled) {
        // Lightweight logger for Phase 0 capturing patch counts (meta added in store commit)
        setHistoryLogger((e: any) => {
            if (process.env.NODE_ENV === 'test') return; // reduce noise in tests
            const summary = {
                t: e.type,
                label: e.meta?.label,
                patchCount: e.meta?.patchCount || e.meta?.undoPatchCount || e.meta?.redoPatchCount || 0,
                past: e.historyLength,
                future: e.redoLength,
                group: e.groupActive,
            };
            // eslint-disable-next-line no-console
            console.debug('[history]', summary);
        });
        w.__undoDebug._loggerInstalled = true;
    }
}

install();

export {}; // side-effects only
