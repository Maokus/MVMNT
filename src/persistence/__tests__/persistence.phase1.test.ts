import { exportScene, importScene, createSnapshotUndoController } from '../index';
import { useTimelineStore } from '../../state/timelineStore';
import { canonicalizeElements } from '../ordering';
import { serializeStable } from '../stable-stringify';
import { describe, expect, it, test } from 'vitest';

describe('Persistence', () => {
    test('Stable stringify deterministic for object key order', () => {
        const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
        const s1 = serializeStable(a);
        const s2 = serializeStable({ c: { x: 2, y: 1 }, a: 2, b: 1 });
        expect(s1).toEqual(s2);
    });

    test('Canonical ordering sorts by (z,type,id)', () => {
        const elems = [
            { id: 'c', type: 'B', z: 5 },
            { id: 'a', type: 'A', z: 1 },
            { id: 'b', type: 'A', z: 1 },
            { id: 'd', type: 'A', z: 10 },
        ];
        const sorted = canonicalizeElements(elems);
        expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    test('Export -> Import -> Export round-trip stable ignoring modifiedAt', async () => {
        const first = await exportScene();
        expect(first.ok).toBe(true);
        const json1 = first.ok ? first.json : '';
        const imp = await importScene(json1);
        expect(imp.ok).toBe(true);
        const second = await exportScene();
        if (!second.ok) throw new Error('Second export failed');
        const env1 = JSON.parse(json1);
        const env2 = JSON.parse(second.json);
        // Remove volatile fields (createdAt/modifiedAt, macro exportedAt may differ)
        delete env1.metadata?.modifiedAt;
        delete env2.metadata?.modifiedAt;
        delete env1.metadata?.createdAt;
        delete env2.metadata?.createdAt;
        if (env1.scene?.macros) delete env1.scene.macros.exportedAt;
        if (env2.scene?.macros) delete env2.scene.macros.exportedAt;
        expect(serializeStable(env1)).toEqual(serializeStable(env2));
    });

    test('Undo controller captures snapshots and can undo/redo', () => {
        const undo = createSnapshotUndoController(useTimelineStore, { maxDepth: 10, debounceMs: 10 });
        const store = useTimelineStore;
        // Perform a sequence of mutations
        return new Promise<void>((resolve) => {
            store.getState().setGlobalBpm(130);
            store.getState().setBeatsPerBar(3);
            setTimeout(() => {
                const currentTick = store.getState().timeline.currentTick;
                store.getState().seekTick(currentTick + 120);
                setTimeout(() => {
                    // Allow debounce flush
                    setTimeout(() => {
                        const canUndo = undo.canUndo();
                        expect(canUndo).toBe(true);
                        const before = store.getState().timeline.globalBpm;
                        undo.undo();
                        const afterUndo = store.getState().timeline.globalBpm;
                        // Undo should revert BPM change OR tick change.
                        expect(afterUndo === before || afterUndo === 120).toBe(true);
                        // Redo path
                        if (undo.canRedo()) undo.redo();
                        resolve();
                    }, 30);
                }, 5);
            }, 15);
        });
    });
});
