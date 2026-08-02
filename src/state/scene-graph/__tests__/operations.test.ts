import { describe, expect, it } from 'vitest';
import {
    applyMatrixToPoint,
    createFlatSceneGraph,
    groupSceneNodes,
    multiplyMatrices,
    nodeTransformToMatrix,
    normalizeNodeSelection,
    transformSceneNodes,
    translationMatrix,
    ungroupSceneNode,
} from '@state/scene-graph';

describe('scene graph Phase 3 operations', () => {
    it('groups non-contiguous siblings at the frontmost selected position without reversing paint order', () => {
        const graph = createFlatSceneGraph(['a', 'b', 'c', 'd']);
        const grouped = groupSceneNodes(graph, ['element:a', 'element:c'], 'group:1');
        const root = grouped.nodesById[grouped.rootId];
        const group = grouped.nodesById['group:1'];
        expect(root.kind === 'root' && root.children).toEqual(['element:b', 'group:1', 'element:d']);
        expect(group.kind === 'group' && group.children).toEqual(['element:a', 'element:c']);
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
        expect(moved.nodesById['group:1'].parentCompensation).toEqual([1, 0, 0, 1, 9, 4]);
        expect(moved.nodesById['element:a'].parentCompensation).toEqual([1, 0, 0, 1, 0, 0]);
    });
});
