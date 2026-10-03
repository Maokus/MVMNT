import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { createKeyframe, nodePropertyTarget } from '@automation/types';
import { resetCommandOverlaysForTest } from '@context/commands/commandOverlay';
import { NodeRow } from '../SceneNodeTree';

const actions = vi.hoisted(() => ({
    selectNode: vi.fn(),
    reparentSelectedNodes: vi.fn(),
    updateElementId: vi.fn(() => true),
}));

vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => actions }));

function renderDropTarget(animated: boolean) {
    for (const elementId of ['child', 'target']) {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId });
    }
    const initial = useSceneStore.getState();
    const child = initial.nodeIdByElementId.child;
    const target = initial.nodeIdByElementId.target;
    dispatchSceneCommand({ type: 'groupNodes', nodeIds: [target], groupId: 'group:target' });
    if (animated) {
        useSceneStore.getState().setAutomationChannel({
            id: 'child-motion',
            target: nodePropertyTarget(child, 'translationX'),
            valueType: 'number',
            keyframes: [createKeyframe(0, 10)],
        });
    }
    const graph = useSceneStore.getState().graph;
    const root = graph.nodesById[graph.rootId];
    if (root.kind !== 'root') throw new Error('Expected root node');
    useSelectionStore.getState().selectSceneNodes([child], child);
    const { container } = render(
        <NodeRow graph={graph} node={graph.nodesById['group:target']} siblingIds={root.children} depth={0} />
    );
    const row = container.querySelector('.scene-node-row') as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        bottom: 100,
        height: 100,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    });
    const dragEvent = (type: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
            clientX: { value: 80 },
            clientY: { value: 50 },
            dataTransfer: { value: { dropEffect: 'move' } },
        });
        return event;
    };
    fireEvent(row, dragEvent('dragover'));
    fireEvent(row, dragEvent('drop'));
    return { child, graph };
}

describe('scene hierarchy reparent mode picker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetCommandOverlaysForTest();
        useSceneStore.getState().clearScene();
        act(() => useSelectionStore.getState().selectSceneNodes([], null));
    });

    it('offers two modes for an animated reparent and captures the drop selection', () => {
        const { child, graph } = renderDropTarget(true);
        expect(actions.reparentSelectedNodes).not.toHaveBeenCalled();
        const keep = screen.getByRole('menuitem', { name: 'Keep transform at playhead' });
        expect(keep).toHaveFocus();
        expect(screen.getByRole('menuitem', { name: 'Keep local animation' })).toBeInTheDocument();
        useSelectionStore.getState().selectSceneNodes([], null);
        fireEvent.click(keep);
        expect(actions.reparentSelectedNodes).toHaveBeenCalledWith(
            'group:target',
            1,
            expect.objectContaining({
                nodeIds: [child],
                mode: 'keepTransform',
                graphRevision: graph.revision,
            })
        );
    });

    it('cancels an animated drop on Escape', () => {
        renderDropTarget(true);
        fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Keep transform at playhead' }), {
            key: 'Escape',
        });
        expect(actions.reparentSelectedNodes).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu', { name: 'Reparent transform mode' })).not.toBeInTheDocument();
    });

    it('shows a failed move in the hierarchy', () => {
        actions.reparentSelectedNodes.mockReturnValueOnce('Cannot preserve transform through a singular matrix');
        renderDropTarget(true);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Keep transform at playhead' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Cannot preserve transform through a singular matrix');
    });

    it('applies the default directly when no affected node is animated', () => {
        const { child } = renderDropTarget(false);
        expect(screen.queryByRole('menu', { name: 'Reparent transform mode' })).not.toBeInTheDocument();
        expect(actions.reparentSelectedNodes).toHaveBeenCalledWith(
            'group:target',
            1,
            expect.objectContaining({ nodeIds: [child] })
        );
    });
});
