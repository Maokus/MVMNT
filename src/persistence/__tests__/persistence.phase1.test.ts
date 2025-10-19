import { exportScene, importScene, createPatchUndoController } from '../index';
import { useTimelineStore } from '@state/timelineStore';
import { canonicalizeElements } from '../ordering';
import { serializeStable } from '../stable-stringify';
import { describe, expect, it, test } from 'vitest';
import type { ExportSceneResultInline } from '../export';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

async function exportInlineScene(): Promise<ExportSceneResultInline> {
    const result = await exportScene(undefined, { storage: 'inline-json' });
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

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
        const first = await exportInlineScene();
        expect(first.ok).toBe(true);
        const json1 = first.json;
        const imp = await importScene(json1);
        expect(imp.ok).toBe(true);
        const second = await exportInlineScene();
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

    test('Undo controller tracks scene commands and can undo/redo', () => {
        const undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        useSceneStore.getState().clearScene();
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'undo-phase1',
            config: { text: { type: 'constant', value: 'Phase1' } },
        });
        expect(undo.canUndo()).toBe(true);
        undo.undo();
        expect(useSceneStore.getState().elements['undo-phase1']).toBeUndefined();
        expect(undo.canRedo()).toBe(true);
        undo.redo();
        expect(useSceneStore.getState().elements['undo-phase1']).toBeDefined();
    });
});
