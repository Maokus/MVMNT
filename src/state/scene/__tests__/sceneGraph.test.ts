import { describe, expect, it } from 'vitest';
import {
    SCENE_ROOT_ID,
    MAX_SCENE_GRAPH_TRAVERSAL,
    buildSceneGraphNavigationIndex,
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
        const result = validateSceneGraph(graph, ['one']);
        expect(result.ok).toBe(false);
        expect(result.errors.map((error) => error.code)).toEqual(
            expect.arrayContaining(['CYCLE', 'UNREACHABLE', 'REFERENCE_NOT_RECIPROCAL'])
        );
    });

    it('traverses, indexes, and validates a large deep graph iteratively', () => {
        const graph: SceneGraphState = createFlatSceneGraph([]);
        const root = graph.nodesById[SCENE_ROOT_ID];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        let parentId = root.id;
        for (let index = 0; index < 20_000; index += 1) {
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
        expect(validateSceneGraph(graph, ['leaf']).ok).toBe(true);
        expect(deriveElementOrder(graph)).toEqual(['leaf']);
        expect(buildSceneGraphNavigationIndex(graph).preorderNodeIds).toHaveLength(20_002);
    });

    it('rejects hostile depth using a traversal budget rather than a product depth rule', () => {
        const graph = createFlatSceneGraph([]);
        let parentId = graph.rootId;
        const nodeCount = Math.floor(MAX_SCENE_GRAPH_TRAVERSAL / 2) + 1;
        for (let index = 0; index < nodeCount; index += 1) {
            const id = `hostile:${index}`;
            graph.nodesById[id] = { ...createNodeBase(id, parentId, id), kind: 'group', children: [] };
            const parent = graph.nodesById[parentId];
            if ('children' in parent) parent.children.push(id);
            parentId = id;
        }
        const result = validateSceneGraph(graph, []);
        expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TRAVERSAL_BUDGET' })]));
    });
});
