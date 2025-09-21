import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { createSnapshotUndoController } from '@persistence/undo/snapshot-undo';
import { DocumentGateway } from '@persistence/document-gateway';

function flush(ms = 30) {
    return new Promise((r) => setTimeout(r, ms));
}

describe('Tempo & meter restoration', () => {
    it('restores bpm and beatsPerBar from snapshot without being clobbered by sceneSettings defaults', async () => {
        const ctrl: any = createSnapshotUndoController(useTimelineStore, { debounceMs: 5, maxDepth: 5 });
        const api: any = useTimelineStore.getState();
        api.setGlobalBpm(150);
        api.setBeatsPerBar(7);
        await flush(20);
        // change again to create another snapshot
        api.setGlobalBpm(180);
        api.setBeatsPerBar(5);
        await flush(20);
        const beforeUndo = useTimelineStore.getState().timeline;
        expect(beforeUndo.globalBpm).toBe(180);
        expect(beforeUndo.beatsPerBar).toBe(5);
        ctrl.undo();
        await flush(10);
        const afterUndo = useTimelineStore.getState().timeline;
        expect(afterUndo.globalBpm).toBe(150);
        expect(afterUndo.beatsPerBar).toBe(7);
    });

    it('does not overwrite restored timeline tempo with stale sceneSettings', () => {
        const api: any = useTimelineStore.getState();
        api.setGlobalBpm(200);
        api.setBeatsPerBar(9);
        const doc = DocumentGateway.build({ includeEphemeral: false });
        // Simulate stale scene settings inside document
        (doc as any).scene.sceneSettings = { tempo: 120, beatsPerBar: 4 };
        DocumentGateway.apply(doc as any);
        const tl = useTimelineStore.getState().timeline;
        expect(tl.globalBpm).toBe(200);
        expect(tl.beatsPerBar).toBe(9);
    });
});
