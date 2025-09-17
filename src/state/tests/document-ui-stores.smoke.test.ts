import { describe, it, expect } from 'vitest';
import { useDocumentStore } from '../document/documentStore';
import { useUIStore } from '../uiStore';

describe('Phase 1 stores scaffolding', () => {
    it('document store initializes with timeline + scene shape', () => {
        const s = useDocumentStore.getState();
        const snap = s.getSnapshot();
        expect(snap).toBeTruthy();
        expect(snap.timeline).toBeTruthy();
        expect(snap.scene).toBeTruthy();
        // Check a couple of fields mirror existing store
        expect(typeof snap.timeline.timeline.id).toBe('string');
        expect(typeof snap.timeline.timeline.currentTick).toBe('number');
        expect(Array.isArray(snap.timeline.tracksOrder)).toBe(true);
        expect(typeof s.getSnapshot).toBe('function');
        const snap2 = s.getSnapshot();
        expect(snap2).not.toBe(snap);
        expect(snap2.timeline.timeline.id).toBe(snap.timeline.timeline.id);
    });

    it('ui store initializes with default values and updates', () => {
        const ui = useUIStore.getState();
        expect(ui.playheadTick).toBe(0);
        expect(ui.timelineZoom).toBe(1);
        ui.setPlayheadTick(123);
        expect(useUIStore.getState().playheadTick).toBe(123);
        ui.setTimelineZoom(2);
        expect(useUIStore.getState().timelineZoom).toBe(2);
        ui.selectElements(['a', 'b']);
        expect(useUIStore.getState().selection.elementIds).toEqual(['a', 'b']);
    });
});
