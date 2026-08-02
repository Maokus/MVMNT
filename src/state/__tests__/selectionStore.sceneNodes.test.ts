import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '@state/selectionStore';
import { createFlatSceneGraph, removeSubtrees } from '@state/scene-graph';

describe('scene-node selection', () => {
    beforeEach(() => useSelectionStore.getState().clearSelection());

    it('tracks active and anchor nodes across toggle and sibling range selection', () => {
        const selection = useSelectionStore.getState();
        selection.selectSceneNodes(['a'], 'a');
        selection.toggleSceneNode('c');
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: ['a', 'c'],
            activeNodeId: 'c',
            anchorNodeId: 'c',
        });
        useSelectionStore.getState().selectSceneNodeRange(['a', 'b', 'c', 'd'], 'a');
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: ['a', 'b', 'c'],
            activeNodeId: 'a',
            anchorNodeId: 'c',
        });
    });

    it('drops stale nodes and resets an invalid editing scope to root', () => {
        const selection = useSelectionStore.getState();
        const graph = createFlatSceneGraph(['new']);
        const root = graph.nodesById[graph.rootId];
        const kept = root.kind === 'root' ? root.children[0] : '';
        selection.selectSceneNodes(['gone', kept], 'gone');
        selection.setEditingContainerId('gone');
        selection.reconcileSceneNodes(graph);
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: [kept],
            activeNodeId: kept,
            editingContainerId: graph.rootId,
        });
    });

    it('reconciles a deleted active node to the nearest surviving sibling', () => {
        const previousGraph = createFlatSceneGraph(['a', 'b', 'c']);
        const root = previousGraph.nodesById[previousGraph.rootId];
        if (root.kind !== 'root') throw new Error('Expected scene root');
        const [, middle, after] = root.children;
        useSelectionStore.getState().selectSceneNodes([middle], middle);

        useSelectionStore.getState().reconcileSceneNodes(removeSubtrees(previousGraph, [middle]), previousGraph);

        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: [after],
            activeNodeId: after,
            anchorNodeId: after,
        });
    });
});
