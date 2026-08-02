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
});
