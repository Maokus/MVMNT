import { describe, expect, it } from 'vitest';
import { createFlatSceneGraph, deriveElementOrder } from '@state/scene-graph';
import { normalizeSceneImportPayload } from '../importExportAdapter';
import { createSceneStore } from '../storeComposition';

describe('scene import/export adapter', () => {
    it('uses graph order when normalizing record-shaped scene elements', () => {
        const graph = createFlatSceneGraph(['second', 'first']);
        const normalized = normalizeSceneImportPayload({
            elements: {
                first: { id: 'first', type: 'shape', properties: {} },
                second: { id: 'second', type: 'textOverlay', properties: {} },
            },
            graph,
        });

        expect(normalized.elements.map((element) => element.id)).toEqual(['second', 'first']);
        expect(normalized.graph).not.toBe(graph);
        expect(deriveElementOrder(normalized.graph)).toEqual(['second', 'first']);
    });

    it('keeps the compatibility import facade on the normalized graph order', () => {
        const store = createSceneStore();
        store.getState().importScene({
            elements: {
                first: { id: 'first', type: 'shape', properties: {} },
                second: { id: 'second', type: 'textOverlay', properties: {} },
            },
            graph: createFlatSceneGraph(['second', 'first']),
        });

        expect(deriveElementOrder(store.getState().graph)).toEqual(['second', 'first']);
        expect(Object.keys(store.getState().exportSceneDraft().elements)).toEqual(['second', 'first']);
    });
});
