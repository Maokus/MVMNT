import { describe, it, expect } from 'vitest';
import { useUIStore } from '../uiStore';
import { getDocumentSnapshot, setGlobalBpm, undo, canUndo } from '../document/actions';
import { useDocumentStore } from '../document/documentStore';

describe('Phase 5 Integration: UI vs Document separation with undo', () => {
    it('UI-only changes do not create document history', () => {
        const doc = useDocumentStore.getState();
        // Clear history
        doc.replace(doc.getSnapshot());
        expect(doc.canUndo).toBe(false);
        expect(doc.canRedo).toBe(false);

        const ui = useUIStore.getState();
        ui.setPlayheadTick(1234);
        ui.setTimelineZoom(2);
        ui.selectElements(['a', 'b']);

        // Document history remains unaffected
        expect(useDocumentStore.getState().canUndo).toBe(false);
        expect(useDocumentStore.getState().canRedo).toBe(false);
    });

    it('Undo reverts document changes only; UI state remains unchanged', () => {
        const ui = useUIStore.getState();
        ui.setPlayheadTick(777);
        ui.setTimelineZoom(1.5);

        const beforeSnap = getDocumentSnapshot();
        const prevBpm = beforeSnap.timeline.timeline.globalBpm;
        setGlobalBpm(prevBpm + 10);
        expect(canUndo()).toBe(true);

        // Ensure document changed
        const after = getDocumentSnapshot();
        expect(after.timeline.timeline.globalBpm).toBe(prevBpm + 10);

        // Undo document change
        undo();
        const undone = getDocumentSnapshot();
        expect(undone.timeline.timeline.globalBpm).toBe(prevBpm);

        // UI state should be untouched
        const uiAfter = useUIStore.getState();
        expect(uiAfter.playheadTick).toBe(777);
        expect(uiAfter.timelineZoom).toBe(1.5);
    });
});
