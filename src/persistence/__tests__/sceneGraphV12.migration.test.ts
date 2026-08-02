import { describe, expect, it } from 'vitest';
import { deriveElementOrder } from '@state/scene-graph';
import { migrateSceneGraphV12 } from '../migrations/sceneGraphV12';

describe('scene graph v12 migration', () => {
    it('preserves v11 order and produces deterministic identity nodes', () => {
        const source = {
            schemaVersion: 11,
            scene: {
                elements: { front: { id: 'front' }, back: { id: 'back' } },
                elementsOrder: ['back', 'front'],
            },
        };
        const first = migrateSceneGraphV12(source as any);
        const second = migrateSceneGraphV12(structuredClone(source) as any);
        expect(first.schemaVersion).toBe(12);
        expect(first.scene.elementsOrder).toBeUndefined();
        expect(first.scene.graph).toEqual(second.scene.graph);
        expect(deriveElementOrder(first.scene.graph)).toEqual(['back', 'front']);
    });
});
