import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { SceneNodeTree } from '../SceneNodeTree';

const sceneActions = vi.hoisted(() => ({
    selectNode: vi.fn(),
    reparentSelectedNodes: vi.fn(() => null),
    updateElementId: vi.fn(() => true),
}));

vi.mock('@context/SceneSelectionContext', () => ({
    useSceneSelection: () => sceneActions,
}));

describe('SceneNodeTree keyboard navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSceneStore.setState({ graph: createFlatSceneGraph(['back', 'front']) });
        useSelectionStore.setState({
            selectedNodeIds: [],
            activeNodeId: null,
            expandedNodeIds: {},
            activeTarget: 'none',
        });
    });

    it('moves the active row down with ArrowDown', () => {
        useSelectionStore.setState({
            activeNodeId: 'element:front',
            selectedNodeIds: ['element:front'],
            activeTarget: 'elements',
        });
        render(<SceneNodeTree />);

        fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });

        expect(sceneActions.selectNode).toHaveBeenCalledWith('element:back');
    });

    it('selects the front row on ArrowDown when nothing is active yet', () => {
        render(<SceneNodeTree />);

        fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });

        expect(sceneActions.selectNode).toHaveBeenCalledWith('element:front');
    });

    it('keeps row focus after committing a rename so navigation keeps working', () => {
        useSelectionStore.setState({
            activeNodeId: 'element:front',
            selectedNodeIds: ['element:front'],
            activeTarget: 'elements',
        });
        render(<SceneNodeTree />);

        const row = screen.getByText('front').closest<HTMLElement>('.scene-node-row')!;
        fireEvent.doubleClick(row);
        const input = row.querySelector<HTMLInputElement>('input.scene-node-rename')!;
        fireEvent.change(input, { target: { value: 'renamed' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(document.activeElement).toBe(row);
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(sceneActions.selectNode).toHaveBeenCalledWith('element:back');
    });

    it('leaves Space to the transport shortcut', () => {
        useSelectionStore.setState({
            activeNodeId: 'element:front',
            selectedNodeIds: ['element:front'],
            activeTarget: 'elements',
        });
        render(<SceneNodeTree />);

        fireEvent.keyDown(screen.getByRole('tree'), { key: ' ' });

        expect(sceneActions.selectNode).not.toHaveBeenCalled();
    });
});
