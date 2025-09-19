import { describe, it, expect } from 'vitest';
import {
    createEmptyDocument,
    applyDocMutation,
    undo,
    redo,
    useDocumentStore,
    computeStructuralHash,
    MUTATION_BATCH_WINDOW_MS,
} from '../';

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

describe('Mutation Funnel & Undo/Redo', () => {
    it('batched rapid mutations produce one undo entry', async () => {
        useDocumentStore.setState({ document: createEmptyDocument(), undoStack: [], redoStack: [] } as any);
        const docStart = useDocumentStore.getState().document;
        applyDocMutation('add-el', (draft) => {
            const id = 'el1';
            draft.elements.byId[id] = { id, name: 'Element 1', start: 0, duration: 100 } as any;
            draft.elements.allIds.push(id);
        });
        applyDocMutation('add-el', (draft) => {
            const id = 'el2';
            draft.elements.byId[id] = { id, name: 'Element 2', start: 10, duration: 100 } as any;
            draft.elements.allIds.push(id);
        });
        const { undoStack } = useDocumentStore.getState();
        expect(undoStack.length).toBe(1);
        expect(Object.keys(useDocumentStore.getState().document.elements.byId).length).toBe(2);
        expect(docStart).not.toBe(useDocumentStore.getState().document);
    });

    it('timeout between mutations prevents batching', async () => {
        useDocumentStore.setState({ document: createEmptyDocument(), undoStack: [], redoStack: [] } as any);
        applyDocMutation('rename', (draft) => {
            draft.meta.name = 'Project A';
        });
        await sleep(MUTATION_BATCH_WINDOW_MS + 30);
        applyDocMutation('rename', (draft) => {
            draft.meta.name = 'Project B';
        });
        const { undoStack } = useDocumentStore.getState();
        expect(undoStack.length).toBe(2);
    });

    it('undo restores previous structural hash and redo restores original', () => {
        useDocumentStore.setState({ document: createEmptyDocument(), undoStack: [], redoStack: [] } as any);
        const before = useDocumentStore.getState().document;
        const hashBefore = computeStructuralHash(before);
        applyDocMutation('meta', (draft) => {
            draft.meta.name = 'Changed';
        });
        const after = useDocumentStore.getState().document;
        const hashAfter = computeStructuralHash(after);
        expect(hashAfter).not.toBe(hashBefore);
        undo();
        const afterUndo = useDocumentStore.getState().document;
        const hashUndo = computeStructuralHash(afterUndo);
        expect(hashUndo).toBe(hashBefore);
        redo();
        const afterRedo = useDocumentStore.getState().document;
        const hashRedo = computeStructuralHash(afterRedo);
        expect(hashRedo).toBe(hashAfter);
    });
});
