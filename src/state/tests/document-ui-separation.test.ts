import { describe, it, expect } from 'vitest';
import { useDocumentStore } from '../document/documentStore';
import { useUIStore } from '../uiStore';

describe('UI mutations do not affect document history (Phase 2)', () => {
    it('changing UI-only state does not create document history entries', () => {
        const doc = useDocumentStore.getState();
        // Clear history
        doc.replace(doc.getSnapshot());
        expect(doc.canUndo).toBe(false);
        expect(doc.canRedo).toBe(false);

        // Perform UI mutations
        const ui = useUIStore.getState();
        ui.setPlayheadTick(1234);
        ui.setTimelineZoom(2.5);
        ui.selectElements(['e1', 'e2']);

        // Document history remains unaffected
        expect(useDocumentStore.getState().canUndo).toBe(false);
        expect(useDocumentStore.getState().canRedo).toBe(false);
    });
});
