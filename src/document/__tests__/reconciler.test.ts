import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createEmptyDocument,
    useDocumentStore,
    applyDocMutation,
    createReconciler,
    ReconcilerLifecycleHooks,
} from '../';

function resetStore() {
    useDocumentStore.setState({ document: createEmptyDocument(), undoStack: [], redoStack: [] } as any);
}

describe('Reconciler', () => {
    beforeEach(() => {
        resetStore();
    });

    it('creates runtime objects for new elements and preserves identity on unrelated changes', () => {
        const rec = useDocumentStore.getState().reconciler;
        applyDocMutation('add-elements', (draft) => {
            const e1 = { id: 'e1', name: 'E1', start: 0, duration: 100 } as any;
            const e2 = { id: 'e2', name: 'E2', start: 50, duration: 100 } as any;
            draft.elements.byId[e1.id] = e1;
            draft.elements.byId[e2.id] = e2;
            draft.elements.allIds.push(e1.id, e2.id);
        });
        const r1 = rec.getElement('e1');
        const r2 = rec.getElement('e2');
        expect(r1).toBeTruthy();
        expect(r2).toBeTruthy();
        applyDocMutation('update-e2', (draft) => {
            draft.elements.byId['e2'].start = 60;
        });
        const r1After = rec.getElement('e1');
        const r2After = rec.getElement('e2');
        expect(r1After).toBe(r1);
        expect(r2After).toBe(r2);
        expect(r2After?.version).toBe(1);
        expect(r1After?.version).toBe(0);
    });

    it('calls lifecycle hooks for create/update/dispose', () => {
        const hooks: ReconcilerLifecycleHooks = {
            onElementCreate: vi.fn(),
            onElementUpdate: vi.fn(),
            onElementDispose: vi.fn(),
            onTrackCreate: vi.fn(),
            onTrackUpdate: vi.fn(),
            onTrackDispose: vi.fn(),
        };
        const customRec = createReconciler(hooks);
        let doc = createEmptyDocument();
        doc.tracks.byId['t1'] = { id: 't1', name: 'Track 1', elementIds: ['e1'] } as any;
        doc.tracks.allIds.push('t1');
        doc.elements.byId['e1'] = { id: 'e1', name: 'Elem 1', start: 0, duration: 100 } as any;
        doc.elements.allIds.push('e1');
        customRec.reconcile(doc);
        expect(hooks.onTrackCreate).toHaveBeenCalledTimes(1);
        expect(hooks.onElementCreate).toHaveBeenCalledTimes(1);
        doc = {
            ...doc,
            elements: {
                ...doc.elements,
                byId: { ...doc.elements.byId, e1: { ...doc.elements.byId['e1'], start: 10 } },
                allIds: [...doc.elements.allIds],
            },
        };
        customRec.reconcile(doc);
        expect(hooks.onElementUpdate).toHaveBeenCalledTimes(1);
        doc = createEmptyDocument();
        customRec.reconcile(doc);
        expect(hooks.onElementDispose).toHaveBeenCalledTimes(1);
        expect(hooks.onTrackDispose).toHaveBeenCalledTimes(1);
        expect(hooks.onTrackUpdate).not.toHaveBeenCalled();
    });
});
