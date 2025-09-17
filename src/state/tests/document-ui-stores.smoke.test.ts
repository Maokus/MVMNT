import { describe, it, expect } from 'vitest';
import { useDocumentStore } from '../document/documentStore';
import { useUIStore } from '../uiStore';

describe('Phase 1 stores scaffolding', () => {
    it('document store initializes with timeline + scene shape', () => {
        const s = useDocumentStore.getState();
        expect(s.doc).toBeTruthy();
        expect(s.doc.timeline).toBeTruthy();
        expect(s.doc.scene).toBeTruthy();
        // Check a couple of fields mirror existing store
        expect(typeof s.doc.timeline.timeline.id).toBe('string');
        expect(typeof s.doc.timeline.timeline.currentTick).toBe('number');
        expect(Array.isArray(s.doc.timeline.tracksOrder)).toBe(true);
        expect(typeof s.getSnapshot).toBe('function');
        const snap = s.getSnapshot();
        expect(snap).not.toBe(s.doc);
        expect(snap.timeline.timeline.id).toBe(s.doc.timeline.timeline.id);
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
