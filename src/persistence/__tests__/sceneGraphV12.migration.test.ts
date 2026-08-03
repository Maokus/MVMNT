import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
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

    it('uses legacy zIndex values for the paint order', () => {
        const migrated = migrateSceneGraphV12({
            schemaVersion: 11,
            scene: {
                // This is the old Layers panel order, not the old render order.
                elementsOrder: ['front', 'unlayered', 'back'],
                elements: {
                    front: { id: 'front', properties: { zIndex: { type: 'constant', value: 4 } } },
                    unlayered: { id: 'unlayered', properties: {} },
                    back: { id: 'back', properties: { zIndex: { type: 'constant', value: -2 } } },
                },
            },
        } as any);

        expect(deriveElementOrder(migrated.scene.graph)).toEqual(['unlayered', 'back', 'front']);
    });

    it('keeps the 0.15.4 scene artifact in its original paint order and leaves positions intact', () => {
        const archive = unzipSync(
            readFileSync(resolve(process.cwd(), 'src/persistence/__fixtures__/legacyProjects/0_15_4.mvt'))
        );
        const source = JSON.parse(new TextDecoder().decode(archive['document.json']!));
        const migrated = migrateSceneGraphV12({ ...source, schemaVersion: 11 });

        expect(deriveElementOrder(migrated.scene.graph)).toEqual([
            'Image 1',
            'bass',
            'support',
            'melody',
            'Audio Locked Oscilloscope 1',
            'Artist',
            'Title',
            'npd3_m',
            'npd3',
            'npd1_m',
            'npd1',
            'npd2',
            'Audio Spectrum 1',
            'Moving Notes Piano Roll 1',
            'DELETE ME',
            'DELETE ME 2',
        ]);
        expect(migrated.scene.elements['Title'].properties.offsetX).toEqual(
            source.scene.elements['Title'].properties.offsetX
        );
        expect(migrated.scene.elements['Moving Notes Piano Roll 1'].properties.offsetY).toEqual(
            source.scene.elements['Moving Notes Piano Roll 1'].properties.offsetY
        );
    });
});
