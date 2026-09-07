import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { useSelectionStore } from '@state/selectionStore';
import { NodeRow } from '../SceneNodeTree';

const sceneActions = vi.hoisted(() => ({
    selectNode: vi.fn(),
    groupSelectedNodes: vi.fn(),
    ungroupSelectedNodes: vi.fn(),
    duplicateSelectedNodes: vi.fn(),
    deleteSelectedNodes: vi.fn(),
    reparentSelectedNodes: vi.fn(),
    updateElementId: vi.fn(() => true),
}));

vi.mock('@context/SceneSelectionContext', () => ({
    useSceneSelection: () => sceneActions,
}));

describe('SceneNodeTree element ID editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSelectionStore.setState({
            selectedNodeIds: [],
            activeNodeId: null,
            expandedNodeIds: {},
        });
    });

    it('keeps the full draft while typing and commits the element ID on blur', () => {
        const graph = createFlatSceneGraph(['old-id']);
        const root = graph.nodesById[graph.rootId];
        if (root.kind !== 'root') throw new Error('invalid fixture');

        render(<NodeRow graph={graph} node={graph.nodesById['element:old-id']} siblingIds={root.children} depth={0} />);

        fireEvent.doubleClick(screen.getByText('old-id'));
        const input = screen.getByDisplayValue('old-id');
        userEvent.type(input, 'long-element-id');

        expect(input).toHaveValue('long-element-id');
        fireEvent.blur(input);
        expect(sceneActions.updateElementId).toHaveBeenCalledWith('old-id', 'long-element-id');
    });

    it('allows another element to be renamed after a duplicate ID is rejected', () => {
        const graph = createFlatSceneGraph(['first', 'second']);
        const root = graph.nodesById[graph.rootId];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        sceneActions.updateElementId.mockReturnValueOnce(false).mockReturnValueOnce(true);

        render(
            <>
                <NodeRow graph={graph} node={graph.nodesById['element:first']} siblingIds={root.children} depth={0} />
                <NodeRow graph={graph} node={graph.nodesById['element:second']} siblingIds={root.children} depth={0} />
            </>
        );

        fireEvent.doubleClick(screen.getByText('second'));
        const duplicateInput = screen.getByDisplayValue('second');
        fireEvent.change(duplicateInput, { target: { value: 'first' } });
        fireEvent.blur(duplicateInput);

        expect(sceneActions.updateElementId).toHaveBeenCalledWith('second', 'first');
        expect(screen.queryByDisplayValue('first')).not.toBeInTheDocument();

        fireEvent.doubleClick(screen.getByText('second'));
        const retryInput = screen.getByDisplayValue('second');
        fireEvent.change(retryInput, { target: { value: 'renamed-second' } });

        expect(retryInput).toHaveValue('renamed-second');
        fireEvent.blur(retryInput);
        expect(sceneActions.updateElementId).toHaveBeenLastCalledWith('second', 'renamed-second');
    });
});
