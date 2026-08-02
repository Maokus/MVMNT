import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '@state/selectionStore';

describe('scene-node selection', () => {
    beforeEach(() => useSelectionStore.getState().clearSelection());

    it('tracks active and anchor nodes across toggle and sibling range selection', () => {
        const selection = useSelectionStore.getState();
        selection.selectSceneNodes(['a'], ['ea'], 'a');
        selection.toggleSceneNode('c', 'ec');
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: ['a', 'c'],
            activeNodeId: 'c',
            anchorNodeId: 'c',
        });
        useSelectionStore.getState().selectSceneNodeRange(['a', 'b', 'c', 'd'], 'a', {
            a: 'ea',
            b: 'eb',
            c: 'ec',
            d: 'ed',
        });
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: ['a', 'b', 'c'],
            selectedElementIds: ['ea', 'eb', 'ec'],
            activeNodeId: 'a',
            anchorNodeId: 'c',
        });
    });

    it('drops stale nodes and resets an invalid editing scope to root', () => {
        const selection = useSelectionStore.getState();
        selection.selectSceneNodes(['gone', 'kept'], ['old', 'new'], 'gone');
        selection.setEditingContainerId('gone');
        selection.reconcileSceneNodes(['root', 'kept'], 'root', { kept: 'new' });
        expect(useSelectionStore.getState()).toMatchObject({
            selectedNodeIds: ['kept'],
            selectedElementIds: ['new'],
            activeNodeId: 'kept',
            editingContainerId: 'root',
        });
    });
});
