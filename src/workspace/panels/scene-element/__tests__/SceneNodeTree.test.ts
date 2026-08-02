import { describe, expect, it } from 'vitest';
import { createFlatSceneGraph, groupSceneNodes } from '@state/scene-graph';
import { resolveTreeDropTarget } from '../SceneNodeTree';

describe('scene hierarchy drop targets', () => {
    it('converts frontmost-first before/after rows to canonical indexes', () => {
        const graph = createFlatSceneGraph(['back', 'middle', 'front']);
        const root = graph.nodesById[graph.rootId];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        const middle = graph.nodesById['element:middle'];
        expect(resolveTreeDropTarget(middle, root.children, 'before')).toEqual({
            parentId: graph.rootId,
            targetIndex: 2,
        });
        expect(resolveTreeDropTarget(middle, root.children, 'after')).toEqual({
            parentId: graph.rootId,
            targetIndex: 1,
        });
    });

    it('targets the canonical front of a nested group for inside drops', () => {
        const graph = groupSceneNodes(createFlatSceneGraph(['a', 'b']), ['element:a'], 'group:nested');
        const group = graph.nodesById['group:nested'];
        expect(resolveTreeDropTarget(group, (graph.nodesById[graph.rootId] as any).children, 'inside')).toEqual({
            parentId: 'group:nested',
            targetIndex: 1,
        });
    });
});
