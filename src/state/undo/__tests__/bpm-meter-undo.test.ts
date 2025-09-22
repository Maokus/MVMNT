import { describe, it, expect } from 'vitest';
import { createSnapshotUndoController } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { instrumentTimelineStoreForUndo } from '@state/undo/snapshot-undo';

// Utility to flush timers
function flush(ms = 25) {
    return new Promise((res) => setTimeout(res, ms));
}

describe('Undo suppression for BPM / meter changes', () => {
    it('does not create a new snapshot immediately after undoing setGlobalBpm / setBeatsPerBar', async () => {
        const ctrl: any = createSnapshotUndoController(useTimelineStore, { maxDepth: 10, debounceMs: 10 });
        instrumentTimelineStoreForUndo();
        const api: any = useTimelineStore.getState();

        api.setGlobalBpm(150);
        api.setBeatsPerBar(7);
        await flush(30); // allow snapshot(s)
        const before = ctrl.debugStack();
        const preUndoLen = before.length;

        // Perform undo (should revert beatsPerBar and bpm) without creating an additional snapshot
        ctrl.undo();
        // Immediately after undo, scheduling should be suppressed
        await flush(5);
        const afterImmediate = ctrl.debugStack();
        expect(afterImmediate.length).toBe(preUndoLen); // no new snapshot

        // Even after debounce window, no new snapshot should have appeared (since state matches existing entry)
        await flush(60); // exceed suppression + ignore budget window
        const after = ctrl.debugStack();
        expect(after.length).toBe(preUndoLen); // still unchanged

        // No extra snapshot should appear purely from the undo path.
    });
});
