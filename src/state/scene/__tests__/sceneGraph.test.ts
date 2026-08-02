import { describe, expect, it } from 'vitest';
import {
    SCENE_ROOT_ID,
    createFlatSceneGraph,
    createNodeBase,
    deriveElementOrder,
    validateSceneGraph,
    type SceneGraphState,
} from '@state/scene-graph';

describe('scene graph substrate', () => {
    it('creates deterministic stable element nodes and derives canonical paint order', () => {
        const graph = createFlatSceneGraph(['back', 'front']);
        expect(graph.nodesById[SCENE_ROOT_ID]).toMatchObject({ children: ['element:back', 'element:front'] });
        expect(deriveElementOrder(graph)).toEqual(['back', 'front']);
        expect(validateSceneGraph(graph, ['back', 'front']).ok).toBe(true);
    });

    it('reports reciprocal references, missing elements, cycles, and unreachable nodes without recursion', () => {
        const graph = createFlatSceneGraph(['one']);
        const root = graph.nodesById[SCENE_ROOT_ID];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        root.children = ['group:a'];
        graph.nodesById['group:a'] = {
            ...createNodeBase('group:a', SCENE_ROOT_ID, 'A'),
            kind: 'group',
            children: ['group:b'],
        };
        graph.nodesById['group:b'] = {
            ...createNodeBase('group:b', 'group:a', 'B'),
            kind: 'group',
            children: ['group:a'],
        };
        const result = validateSceneGraph(graph, ['one'], false);
        expect(result.ok).toBe(false);
        expect(result.errors.map((error) => error.code)).toEqual(
            expect.arrayContaining(['CYCLE', 'UNREACHABLE', 'REFERENCE_NOT_RECIPROCAL'])
        );
    });

    it('traverses a deep valid graph iteratively when the product depth gate is disabled', () => {
        const graph: SceneGraphState = createFlatSceneGraph([]);
        const root = graph.nodesById[SCENE_ROOT_ID];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        let parentId = root.id;
        for (let index = 0; index < 2000; index += 1) {
            const id = `group:${index}`;
            graph.nodesById[id] = { ...createNodeBase(id, parentId, id), kind: 'group', children: [] };
            const parent = graph.nodesById[parentId];
            if ('children' in parent) parent.children.push(id);
            parentId = id;
        }
        const leaf = {
            ...createNodeBase('element:leaf', parentId, 'leaf'),
            kind: 'element' as const,
            elementId: 'leaf',
        };
        graph.nodesById[leaf.id] = leaf;
        const parent = graph.nodesById[parentId];
        if ('children' in parent) parent.children.push(leaf.id);
        expect(validateSceneGraph(graph, ['leaf'], false).ok).toBe(true);
        expect(deriveElementOrder(graph)).toEqual(['leaf']);
    });
});
