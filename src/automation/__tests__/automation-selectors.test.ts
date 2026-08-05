import { beforeEach, describe, expect, it } from 'vitest';
import { createChannel, elementPropertyTarget, encodePropertyOwner, nodePropertyTarget } from '../types';
import { selectAutomationSceneNodes, selectVisibleAutomationRowCount } from '../selectors';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSceneStore } from '@state/sceneStore';

describe('scene hierarchy automation selectors', () => {
    beforeEach(() => {
        useSceneStore.getState().clearScene();
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'shared' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'other' });
        const state = useSceneStore.getState();
        dispatchSceneCommand({
            type: 'groupNodes',
            nodeIds: [state.nodeIdByElementId.shared, state.nodeIdByElementId.other],
            groupId: 'group',
            name: 'Animated group',
        });
    });

    it('keeps host and content channels distinct under one scene-node row', () => {
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId.shared;
        state.setAutomationChannel(createChannel(nodePropertyTarget(nodeId, 'translationX'), 'number'));
        state.setAutomationChannel(createChannel(elementPropertyTarget('shared', 'elementOpacity'), 'number'));

        const rows = selectAutomationSceneNodes(useSceneStore.getState());
        expect(rows.map((row) => row.nodeId)).toEqual(['group', nodeId]);
        expect(rows[0]).toMatchObject({ name: 'Animated group', depth: 0, hostChannels: [], contentChannels: [] });
        expect(rows[1].hostChannels[0].target.owner).toEqual({ kind: 'node', id: nodeId });
        expect(rows[1].contentChannels[0].target.owner).toEqual({ kind: 'element', id: 'shared' });
    });

    it('uses the element ID label even when a legacy node name is stale', () => {
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId.shared;
        const graph = structuredClone(state.graph);
        graph.nodesById[nodeId].name = 'shared copy';
        useSceneStore.setState({ graph });
        state.setAutomationChannel(createChannel(elementPropertyTarget('shared', 'elementOpacity'), 'number'));

        expect(selectAutomationSceneNodes(useSceneStore.getState()).find((row) => row.nodeId === nodeId)?.name).toBe(
            'shared'
        );
    });

    it('counts typed scene rows and expanded direct channels', () => {
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId.shared;
        state.setAutomationChannel(createChannel(nodePropertyTarget(nodeId, 'translationX'), 'number'));
        useSceneStore.setState((current) => ({
            interaction: {
                ...current.interaction,
                automationExpandedOwners: [encodePropertyOwner({ kind: 'node', id: nodeId })],
            },
        }));
        expect(selectVisibleAutomationRowCount(useSceneStore.getState())).toBe(3);
    });
});
