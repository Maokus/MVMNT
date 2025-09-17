import { describe, it, expect } from 'vitest';
import { useDocumentStore } from '../document/documentStore';

const getSnap = () => useDocumentStore.getState().getSnapshot();

describe('DocumentStore patch-based history (Phase 2)', () => {
    it('commit creates history, undo/redo works, redo cleared on new commit', () => {
        const api = useDocumentStore.getState();
        api.replace(getSnap()); // clear history
        expect(api.canUndo).toBe(false);
        expect(api.canRedo).toBe(false);

        // Mutate a simple numeric field
        const before = getSnap();
        const prevTick = before.timeline.timeline.currentTick;
        api.commit((d) => {
            d.timeline.timeline.currentTick = prevTick + 10;
        }, { label: 'nudge playhead' });
        expect(useDocumentStore.getState().canUndo).toBe(true);
        const after = getSnap();
        expect(after.timeline.timeline.currentTick).toBe(prevTick + 10);

        api.undo();
        const undone = getSnap();
        expect(undone.timeline.timeline.currentTick).toBe(prevTick);
        expect(useDocumentStore.getState().canRedo).toBe(true);

        api.redo();
        const redone = getSnap();
        expect(redone.timeline.timeline.currentTick).toBe(prevTick + 10);

        // New commit clears redo
        api.commit((d) => {
            d.timeline.timeline.currentTick = prevTick + 5;
        }, { label: 'nudge playhead again' });
        expect(useDocumentStore.getState().canRedo).toBe(false);
    });

    it('replace clears history', () => {
        const api = useDocumentStore.getState();
        api.commit((d) => {
            d.timeline.timeline.currentTick += 1;
        });
        expect(api.canUndo).toBe(true);
        const snap = getSnap();
        api.replace(snap);
        expect(useDocumentStore.getState().canUndo).toBe(false);
        expect(useDocumentStore.getState().canRedo).toBe(false);
    });

    it('history cap trims oldest entries', () => {
        const api = useDocumentStore.getState();
        api.setHistoryCap(3);
        api.replace(getSnap());
        for (let i = 0; i < 5; i++) {
            api.commit((d) => {
                d.timeline.timeline.currentTick += 1;
            }, { label: `step ${i}` });
        }
        // We can undo at most 3 times
        api.undo();
        api.undo();
        api.undo();
        const before = getSnap();
        api.undo(); // should be no-op now
        const after = getSnap();
        expect(after.timeline.timeline.currentTick).toBe(before.timeline.timeline.currentTick);
        // Restore default cap
        api.setHistoryCap(200);
    });

    it('dev-time snapshot rejects direct mutation attempts', () => {
        const api = useDocumentStore.getState();
        const snap = api.getSnapshot();
        let threw = false;
        try {
            // @ts-ignore
            snap.timeline.timeline.currentTick += 1;
        } catch (e) {
            threw = true;
        }
        expect(threw).toBe(true);
    });
});
