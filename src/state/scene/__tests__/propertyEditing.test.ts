import { beforeEach, describe, expect, it } from 'vitest';
import { createChannel, createKeyframe, elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import { dispatchSceneCommand } from '../commandGateway';
import { buildPropertyEditCommands, dispatchPropertyEdits, effectiveValueForTarget } from '../propertyEditing';
import { useSceneStore } from '@state/sceneStore';

describe('shared property editing', () => {
    beforeEach(() => {
        useSceneStore.getState().clearScene();
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'element' });
    });

    it('writes unbound node and element values through their native backing stores', () => {
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId.element;
        dispatchPropertyEdits(
            [
                { target: nodePropertyTarget(nodeId, 'translationX'), value: 42, valueType: 'number' },
                { target: elementPropertyTarget('element', 'visible'), value: false, valueType: 'boolean' },
            ],
            { tick: 0, autoKey: false, source: 'test' }
        );

        const next = useSceneStore.getState();
        expect(next.graph.nodesById[nodeId].userNodeTransform.translationX).toBe(42);
        expect(next.bindings.byElement.element.visible).toEqual({ type: 'constant', value: false });
    });

    it('auto-key promotes constants for both owner kinds in one batch', () => {
        const nodeId = useSceneStore.getState().nodeIdByElementId.element;
        dispatchPropertyEdits(
            [
                { target: nodePropertyTarget(nodeId, 'rotation'), value: 1, valueType: 'number' },
                { target: elementPropertyTarget('element', 'elementOpacity'), value: 0.5, valueType: 'number' },
            ],
            { tick: 120, autoKey: true, source: 'test' }
        );

        const state = useSceneStore.getState();
        expect(Object.values(state.automation.channels)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ target: nodePropertyTarget(nodeId, 'rotation') }),
                expect.objectContaining({ target: elementPropertyTarget('element', 'elementOpacity') }),
            ])
        );
        expect(Object.values(state.automation.channels).every((channel) => channel.keyframes[0].tick === 120)).toBe(
            true
        );
    });

    it('edits an automated property at the playhead even when auto-key is off and preserves interpolation', () => {
        const target = elementPropertyTarget('element', 'elementOpacity');
        const channel = createChannel(target, 'number');
        channel.keyframes = [
            {
                ...createKeyframe(24, 0.25),
                segmentInterpolation: { mode: 'bounce', direction: 'ease_out' },
            },
        ];
        useSceneStore.getState().setAutomationChannel(channel);
        useSceneStore.getState().updateBindings('element', {
            elementOpacity: { type: 'keyframes', channelId: channel.id },
        });

        const commands = buildPropertyEditCommands(
            useSceneStore.getState(),
            [{ target, value: 0.75, valueType: 'number' }],
            { tick: 24, autoKey: false }
        );
        expect(commands[0]).toMatchObject({
            type: 'addKeyframe',
            channelId: channel.id,
            keyframe: {
                tick: 24,
                value: 0.75,
                segmentInterpolation: { mode: 'bounce', direction: 'ease_out' },
            },
        });
    });

    it('layers an uncommitted node-transform preview over automation until that property is committed', () => {
        const state = useSceneStore.getState();
        const nodeId = state.nodeIdByElementId.element;
        const target = nodePropertyTarget(nodeId, 'translationX');
        const channel = createChannel(target, 'number');
        channel.keyframes = [createKeyframe(0, 12)];
        state.setAutomationChannel(channel);
        state.updateNodeBindings(nodeId, { translationX: { type: 'keyframes', channelId: channel.id } });
        state.setTransientNodeTransform(nodeId, { translationX: 48, rotation: 1 });

        expect(effectiveValueForTarget(useSceneStore.getState(), target, 0)).toBe(48);

        useSceneStore.getState().clearTransientNodeTransforms([nodeId], ['translationX']);
        expect(effectiveValueForTarget(useSceneStore.getState(), target, 0)).toBe(12);
        expect(useSceneStore.getState().transientNodeTransforms[nodeId]).toEqual({ rotation: 1 });
    });
});
