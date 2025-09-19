import { describe, it, expect } from 'vitest';
import { createSnapshotUndoController } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';

async function addTrackNamed(name: string) {
    await useTimelineStore.getState().addMidiTrack({ name });
}

function currentTrackNames(): string[] {
    const s = useTimelineStore.getState();
    return s.tracksOrder.map((id) => s.tracks[id]?.name || '');
}

describe('SnapshotUndoController', () => {
    it('supports multi-level undo/redo without capturing undo itself', async () => {
        const ctrl: any = createSnapshotUndoController(useTimelineStore, { maxDepth: 10, debounceMs: 5 });
        // allow initial snapshot settle
        await new Promise((r) => setTimeout(r, 10));

        expect(ctrl.canUndo()).toBe(false);

        await addTrackNamed('A');
        await new Promise((r) => setTimeout(r, 10)); // allow capture
        await addTrackNamed('B');
        await new Promise((r) => setTimeout(r, 10));

        expect(currentTrackNames()).toEqual(['A', 'B']);
        // After two mutations we should now have at least 2 snapshots (initial + A + B)
        expect(ctrl.canUndo()).toBe(true);

        ctrl.undo();
        expect(currentTrackNames()).toEqual(['A']);
        expect(ctrl.canUndo()).toBe(true);

        ctrl.undo();
        expect(currentTrackNames()).toEqual([]);
        expect(ctrl.canUndo()).toBe(false);
        expect(ctrl.canRedo()).toBe(true);

        ctrl.redo();
        expect(currentTrackNames()).toEqual(['A']);
        ctrl.redo();
        expect(currentTrackNames()).toEqual(['A', 'B']);
        expect(ctrl.canRedo()).toBe(false);
    });
});
