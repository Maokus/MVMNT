import create from 'zustand';
import { produceWithPatches, enableMapSet, enablePatches } from 'immer';
import type { DocumentRoot } from './schema';
import { createEmptyDocument } from './schema';
import { computeStructuralHash } from './hash';
import { createReconciler, Reconciler } from './reconciler';

enableMapSet();
enablePatches();

export interface UndoEntry {
    label: string;
    patches: any[]; // Immer Patch[] (kept as any to avoid importing type)
    inversePatches: any[]; // inverse patches
    timestamp: number; // commit time (ms)
    batchable: boolean; // whether next mutation with same label within window can merge
    hashBefore: string; // structural hash before applying (for debug/assert)
    hashAfter: string; // structural hash after applying (for quick equality checks)
}

interface DocumentState {
    document: DocumentRoot;
    undoStack: UndoEntry[];
    redoStack: UndoEntry[];
    lastCommitAt: number;
    reconciler: Reconciler; // runtime reconciler instance
    applyDocMutation: (label: string, fn: (draft: DocumentRoot) => void, options?: { batchable?: boolean }) => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

export const MUTATION_BATCH_WINDOW_MS = 250; // gesture window

export const useDocumentStore = create<DocumentState>((set, get) => ({
    document: createEmptyDocument(),
    undoStack: [],
    redoStack: [],
    lastCommitAt: 0,
    reconciler: createReconciler(),
    applyDocMutation: (label, fn, options) => {
        const { document, undoStack, reconciler } = get();
        const hashBefore = computeStructuralHash(document);
        const startTime = performance.now ? performance.now() : Date.now();
        const batchable = options?.batchable !== false; // default true
        const [nextDoc, patches, inversePatches] = produceWithPatches(document, (draft: DocumentRoot) => {
            fn(draft);
            // Do not update modifiedAt inside gesture merges until commit; we set it once per produce call
            draft.modifiedAt = Date.now();
        });

        const now = Date.now();
        const hashAfter = computeStructuralHash(nextDoc);

        // Decide if we merge with previous entry
        let newUndoStack = undoStack.slice();
        const last = newUndoStack[newUndoStack.length - 1];
        if (
            last &&
            last.batchable &&
            batchable &&
            last.label === label &&
            now - last.timestamp <= MUTATION_BATCH_WINDOW_MS
        ) {
            // Merge by appending patches; recompute hashAfter
            last.patches.push(...patches);
            last.inversePatches.unshift(...inversePatches); // inverse need to apply in reverse order; simplest: prepend
            last.timestamp = now;
            last.hashAfter = hashAfter;
        } else {
            newUndoStack.push({
                label,
                patches: [...patches],
                inversePatches: [...inversePatches],
                timestamp: now,
                batchable,
                hashBefore,
                hashAfter,
            });
        }

        set({ document: nextDoc, undoStack: newUndoStack, redoStack: [], lastCommitAt: now });
        // Reconcile runtime graph after committing the (possibly merged) mutation.
        reconciler.reconcile(nextDoc);

        const endTime = performance.now ? performance.now() : Date.now();
        if (endTime - startTime > 16) {
            // Lightweight dev-only notice (can remove later)
            // eslint-disable-next-line no-console
            console.debug('[doc] mutation', label, 'took', (endTime - startTime).toFixed(2), 'ms');
        }
    },
    undo: () => {
        const { undoStack, document, redoStack, reconciler } = get();
        if (!undoStack.length) return;
        const entry = undoStack[undoStack.length - 1];
        // Apply inverse patches sequentially using Immer produceWithPatches over no-op draft? Instead we can re-play patches manually.
        // Simpler: reconstruct previous doc by applying inverse patches to current doc.
        const prev = applyPatches(document, entry.inversePatches);
        const newUndo = undoStack.slice(0, undoStack.length - 1);
        const newRedo = [...redoStack, entry];
        set({ document: prev, undoStack: newUndo, redoStack: newRedo });
        reconciler.reconcile(prev);
    },
    redo: () => {
        const { redoStack, document, undoStack, reconciler } = get();
        if (!redoStack.length) return;
        const entry = redoStack[redoStack.length - 1];
        const next = applyPatches(document, entry.patches);
        const newRedo = redoStack.slice(0, redoStack.length - 1);
        const newUndo = [...undoStack, entry];
        set({ document: next, undoStack: newUndo, redoStack: newRedo });
        reconciler.reconcile(next);
    },
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,
}));

// Minimal patch application (subset) for plain object/array patches from Immer.
// We implement a tiny interpreter to avoid importing applyPatches (keeping dependency minimal); however Immer already exposes applyPatches.
// For simplicity & correctness, we'll import it instead of rewriting.
import { applyPatches } from 'immer';

export function applyDocMutation(label: string, fn: (draft: DocumentRoot) => void, options?: { batchable?: boolean }) {
    useDocumentStore.getState().applyDocMutation(label, fn, options);
}

export function undo() {
    useDocumentStore.getState().undo();
}
export function redo() {
    useDocumentStore.getState().redo();
}
export function canUndo() {
    return useDocumentStore.getState().canUndo();
}
export function canRedo() {
    return useDocumentStore.getState().canRedo();
}

// Development helper: subscribe to document hash changes (optional)
export function subscribeToDocument(cb: (doc: DocumentRoot) => void) {
    return useDocumentStore.subscribe((state, prev) => {
        if (state.document !== prev.document) cb(state.document);
    });
}
