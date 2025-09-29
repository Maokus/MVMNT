import { describe, it, expect, beforeEach } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { exportScene } from '@persistence/export';
import { createSnapshotUndoController } from '@state/undo/snapshot-undo';
import { useTimelineStore } from '@state/timelineStore';
import { instrumentTimelineStoreForUndo } from '@state/undo/snapshot-undo';
import type { ExportSceneResult, ExportSceneResultInline } from '@persistence/export';

function requireInline(result: ExportSceneResult): ExportSceneResultInline {
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

describe('Persistence - selection omission & undo triggers', () => {
    beforeEach(() => {
        // Reset store to initial state
        useTimelineStore.setState((s: any) => ({
            ...s,
            tracks: {},
            tracksOrder: [],
            selection: { selectedTrackIds: [] },
        }));
        createSnapshotUndoController(useTimelineStore, { maxDepth: 10, debounceMs: 5 });
        instrumentTimelineStoreForUndo();
    });

    it('exported scene does not contain selection field', async () => {
        // Add a track (selection may change during usage but we ignore it)
        await useTimelineStore.getState().addMidiTrack({ name: 'Track 1' });
        const result = requireInline(await exportScene());
        if (!result.ok) throw new Error('export failed or disabled');
        const json = result.json;
        expect(json.includes('selection')).toBe(false);
    });

    it('undo captures add/remove track and playback range change', async () => {
        const undo: any = (window as any).__mvmntUndo;
        const store = useTimelineStore.getState();
        const id = await store.addMidiTrack({ name: 'T1' });
        // allow debounce flush
        await new Promise((r) => setTimeout(r, 15));
        expect(undo.canUndo()).toBe(true);
        // change playback range
        store.setPlaybackRangeExplicitTicks(0, CANONICAL_PPQ);
        await new Promise((r) => setTimeout(r, 15));
        const canUndoAfterRange = undo.canUndo();
        expect(canUndoAfterRange).toBe(true);
        // remove track
        store.removeTrack(id);
        await new Promise((r) => setTimeout(r, 15));
        expect(undo.canUndo()).toBe(true);
        // perform undo chain should eventually restore track
        undo.undo(); // undo remove
        await new Promise((r) => setTimeout(r, 10));
        const tracksOrder = useTimelineStore.getState().tracksOrder;
        expect(tracksOrder.includes(id)).toBe(true);
    });
});
