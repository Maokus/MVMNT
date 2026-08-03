import { describe, expect, it } from 'vitest';
import {
    applyMatrixToPoint,
    buildSceneGraphNavigationIndex,
    cloneSubtrees,
    createFlatSceneGraph,
    groupSceneNodes,
    multiplyMatrices,
    matrixToNodeTransform,
    nodeTransformToMatrix,
    normalizeNodeSelection,
    reparentSceneNodes,
    removeSubtrees,
    transformSceneNodes,
    translationMatrix,
    ungroupSceneNode,
    validateSceneGraph,
} from '@state/scene-graph';
import { buildSceneStructureIndex } from '@state/scene/resolvedScene';

describe('recursive scene graph operations', () => {
    it('round-trips authored similarity transforms while changing the pivot', () => {
        const transform = {
            translationX: 12,
            translationY: -8,
            rotation: 0.42,
            scaleX: 1.75,
            scaleY: 0.8,
            pivotX: 20,
            pivotY: 30,
        };
        const matrix = nodeTransformToMatrix(transform);
        const repivoted = matrixToNodeTransform(matrix, 80, -15);
        expect(repivoted).not.toBeNull();
        nodeTransformToMatrix(repivoted!).forEach((value, index) => expect(value).toBeCloseTo(matrix[index], 10));
    });

    it('groups non-contiguous siblings at the frontmost selected position without reversing paint order', () => {
        const graph = createFlatSceneGraph(['a', 'b', 'c', 'd']);
        const grouped = groupSceneNodes(graph, ['element:a', 'element:c'], 'group:1');
        const root = grouped.nodesById[grouped.rootId];
        const group = grouped.nodesById['group:1'];
        expect(root.kind === 'root' && root.children).toEqual(['element:b', 'group:1', 'element:d']);
        expect(group.kind === 'group' && group.children).toEqual(['element:a', 'element:c']);
    });

    it('centres a new group transform on the selected artwork without moving its children', () => {
        const graph = createFlatSceneGraph(['a', 'b']);
        const grouped = groupSceneNodes(graph, ['element:a', 'element:b'], 'group:1', 'Group', { x: 40, y: 25 });
        const group = grouped.nodesById['group:1'];

        expect(group.userNodeTransform).toMatchObject({
            translationX: 40,
            translationY: 25,
            pivotX: 40,
            pivotY: 25,
        });
        const effectiveGroupMatrix = multiplyMatrices(
            group.parentCompensation,
            nodeTransformToMatrix(group.userNodeTransform)
        );
        effectiveGroupMatrix.forEach((value, index) => expect(value).toBeCloseTo([1, 0, 0, 1, 0, 0][index], 10));
    });

    it('preserves child world position when a transformed group is ungrouped', () => {
        const graph = groupSceneNodes(createFlatSceneGraph(['a']), ['element:a'], 'group:1');
        graph.nodesById['group:1'].userNodeTransform.translationX = 25;
        graph.nodesById['element:a'].userNodeTransform.translationY = 7;
        const ungrouped = ungroupSceneNode(graph, 'group:1');
        const leaf = ungrouped.nodesById['element:a'];
        const point = applyMatrixToPoint(
            multiplyMatrices(leaf.parentCompensation, nodeTransformToMatrix(leaf.userNodeTransform)),
            { x: 0, y: 0 }
        );
        expect(point).toEqual({ x: 25, y: 7 });
    });

    it('normalizes ancestor/descendant selection and applies a world delta once', () => {
        const graph = groupSceneNodes(createFlatSceneGraph(['a']), ['element:a'], 'group:1');
        expect(normalizeNodeSelection(graph, ['group:1', 'element:a'])).toEqual(['group:1']);
        const moved = transformSceneNodes(graph, ['group:1', 'element:a'], translationMatrix(9, 4));
        expect(moved.nodesById['group:1'].parentCompensation).toEqual([1, 0, 0, 1, 0, 0]);
        expect(moved.nodesById['group:1'].userNodeTransform.translationX).toBeCloseTo(9);
        expect(moved.nodesById['group:1'].userNodeTransform.translationY).toBeCloseTo(4);
        expect(moved.nodesById['element:a'].parentCompensation).toEqual([1, 0, 0, 1, 0, 0]);
    });

    it('keeps structural compensation unchanged when transforming a reparented node', () => {
        let graph = createFlatSceneGraph(['a', 'b']);
        graph = groupSceneNodes(graph, ['element:a'], 'group:left');
        graph = groupSceneNodes(graph, ['element:b'], 'group:right');
        graph.nodesById['group:left'].userNodeTransform.rotation = 0.2;
        graph.nodesById['group:right'].userNodeTransform.rotation = -0.35;
        graph.nodesById['group:right'].userNodeTransform.scaleX = 1.4;
        graph.nodesById['group:right'].userNodeTransform.scaleY = 1.4;
        graph = reparentSceneNodes(graph, ['element:a'], 'group:right', 0);
        const beforeCompensation = [...graph.nodesById['element:a'].parentCompensation];
        const beforeWorld = buildSceneStructureIndex(graph).byNodeId.get('element:a')!.nodeWorldTransform;
        const moved = transformSceneNodes(graph, ['element:a'], translationMatrix(11, -6));
        const afterWorld = buildSceneStructureIndex(moved).byNodeId.get('element:a')!.nodeWorldTransform;
        expect(moved.nodesById['element:a'].parentCompensation).toEqual(beforeCompensation);
        expect(afterWorld[4]).toBeCloseTo(beforeWorld[4] + 11, 10);
        expect(afterWorld[5]).toBeCloseTo(beforeWorld[5] - 6, 10);
    });

    it('indexes arbitrary-depth ancestry and preserves world transforms across parents', () => {
        let graph = createFlatSceneGraph(['a', 'b']);
        graph = groupSceneNodes(graph, ['element:a'], 'group:left');
        graph = groupSceneNodes(graph, ['element:b'], 'group:right');
        graph.nodesById['group:left'].userNodeTransform.translationX = 40;
        graph.nodesById['group:left'].userNodeTransform.rotation = 0.3;
        graph.nodesById['group:right'].userNodeTransform.translationY = 70;
        graph.nodesById['group:right'].userNodeTransform.scaleX = 1.5;
        graph.nodesById['group:right'].userNodeTransform.scaleY = 1.5;
        const before = buildSceneStructureIndex(graph).byNodeId.get('element:a')!.nodeWorldTransform;
        const moved = reparentSceneNodes(graph, ['element:a'], 'group:right', 0);
        const after = buildSceneStructureIndex(moved).byNodeId.get('element:a')!.nodeWorldTransform;
        after.forEach((value, index) => expect(value).toBeCloseTo(before[index], 12));
        expect(moved.nodesById['element:a'].parentId).toBe('group:right');
        expect(validateSceneGraph(moved, ['a', 'b']).ok).toBe(true);
    });

    it('rejects cycle-producing moves without mutating the source graph', () => {
        let graph = createFlatSceneGraph(['a']);
        graph = groupSceneNodes(graph, ['element:a'], 'group:inner');
        graph = groupSceneNodes(graph, ['group:inner'], 'group:outer');
        const snapshot = JSON.stringify(graph);
        expect(() => reparentSceneNodes(graph, ['group:outer'], 'group:inner', 0)).toThrow(/descendants/);
        expect(JSON.stringify(graph)).toBe(snapshot);
    });

    it('removes multi-parent subtrees in stable preorder before inserting them', () => {
        let graph = createFlatSceneGraph(['a', 'b', 'c', 'd']);
        graph = groupSceneNodes(graph, ['element:a', 'element:b'], 'group:left');
        graph = groupSceneNodes(graph, ['element:c', 'element:d'], 'group:right');
        const moved = reparentSceneNodes(graph, ['element:b', 'element:c'], graph.rootId, 1);
        const root = moved.nodesById[moved.rootId];
        expect(root.kind === 'root' && root.children).toEqual(['group:left', 'element:b', 'element:c', 'group:right']);
        expect((moved.nodesById['group:left'] as any).children).toEqual(['element:a']);
        expect((moved.nodesById['group:right'] as any).children).toEqual(['element:d']);
    });

    it('duplicates, deletes, and ungroups nested subtrees without aliasing records', () => {
        let graph = createFlatSceneGraph(['a', 'b']);
        graph = groupSceneNodes(graph, ['element:a'], 'group:inner');
        graph = groupSceneNodes(graph, ['group:inner', 'element:b'], 'group:outer');
        const mappings = {
            nodeIdMap: {
                'group:outer': 'copy:outer',
                'group:inner': 'copy:inner',
                'element:a': 'copy:a',
                'element:b': 'copy:b',
            },
            elementIdMap: { a: 'a copy', b: 'b copy' },
        };
        const duplicated = cloneSubtrees(graph, ['group:outer'], mappings);
        expect(duplicated.nodesById['copy:inner']).not.toBe(graph.nodesById['group:inner']);
        expect(duplicated.nodesById['copy:a']).toMatchObject({ parentId: 'copy:inner', elementId: 'a copy' });
        const ungrouped = ungroupSceneNode(duplicated, 'copy:inner');
        expect((ungrouped.nodesById['copy:outer'] as any).children).toEqual(['copy:a', 'copy:b']);
        const removed = removeSubtrees(ungrouped, ['copy:outer']);
        expect(Object.keys(removed.nodesById).some((id) => id.startsWith('copy:'))).toBe(false);
    });

    it('keeps validator invariants through deterministic randomized recursive moves', () => {
        let graph = createFlatSceneGraph(Array.from({ length: 24 }, (_, index) => `e${index}`));
        let seed = 0x12345678;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
        for (let index = 0; index < 150; index += 1) {
            const nodes = Object.values(graph.nodesById).filter((node) => node.kind !== 'root');
            const containers = Object.values(graph.nodesById).filter((node) => 'children' in node);
            const moving = nodes[Math.floor(random() * nodes.length)];
            const target = containers[Math.floor(random() * containers.length)];
            try {
                graph = reparentSceneNodes(
                    graph,
                    [moving.id],
                    target.id,
                    Math.floor(random() * (target.children.length + 1))
                );
            } catch {
                // Cycle and singular-target attempts are expected command preflight failures.
            }
            expect(
                validateSceneGraph(
                    graph,
                    Array.from({ length: 24 }, (_, n) => `e${n}`)
                ).ok
            ).toBe(true);
        }
        const index = buildSceneGraphNavigationIndex(graph);
        expect(index.preorderNodeIds).toHaveLength(25);
    });
});
