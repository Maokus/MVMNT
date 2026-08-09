import { describe, expect, it } from 'vitest';
import { createSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { createChannel, nodePropertyTarget } from '@automation/types';

describe('scene state ownership contracts', () => {
    it('keeps transient editor state out of the scene document store', () => {
        const document = createSceneStore().getState();

        expect(document).not.toHaveProperty('interaction');
        expect(document).not.toHaveProperty('transientNodeTransforms');
        expect(document).not.toHaveProperty('setPropertyClipboard');
    });

    it('owns panel and transform-preview state in the editor store', () => {
        const editor = useSceneEditorStore.getState();
        editor.resetEditorState();
        editor.setAutomationSearchQuery('opacity');
        editor.setTransientNodeTransform('node:one', { translationX: 42 });

        expect(useSceneEditorStore.getState()).toMatchObject({
            automationSearchQuery: 'opacity',
            transientNodeTransforms: { 'node:one': { translationX: 42 } },
        });
    });

    it('constructs automation mutations as a real store capability', () => {
        const store = createSceneStore();
        const rootId = store.getState().graph.rootId;
        const graph = structuredClone(store.getState().graph);
        graph.nodesById.group = {
            id: 'group',
            kind: 'group',
            name: 'Group',
            parentId: rootId,
            children: [],
            localVisible: true,
            localOpacity: 1,
            localLocked: false,
            userNodeTransform: {
                translationX: 0,
                translationY: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                pivotX: 0,
                pivotY: 0,
            },
            parentCompensation: [1, 0, 0, 1, 0, 0],
        };
        const root = graph.nodesById[rootId];
        if (!root || !('children' in root)) throw new Error('missing scene root');
        root.children.push('group');
        store.getState().replaceGraph(graph);
        const channel = createChannel(nodePropertyTarget('group', 'translationX'), 'number');
        store.getState().setAutomationChannel(channel);

        expect(store.getState().automation.channels[channel.id]).toEqual(channel);
    });
});
