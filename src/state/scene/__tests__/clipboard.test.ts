import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from '@state/sceneStore';
import { createSceneClipboard } from '../clipboard';
import { dispatchSceneCommand } from '../commandGateway';
import { createKeyframe, elementPropertyTarget } from '@automation/types';

beforeEach(() => {
    useSceneStore.getState().clearScene();
    dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'text' });
});
afterEach(() => useSceneStore.getState().clearScene());

describe('scene clipboard pose capture', () => {
    it('preserves stacking order regardless of selection click order', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'second' });
        const state = useSceneStore.getState();
        const root = state.graph.nodesById[state.graph.rootId];
        if (!('children' in root)) throw new Error('Expected scene root');
        const clipboard = createSceneClipboard(state, [...root.children].reverse(), 0);
        expect(clipboard.full.roots).toEqual(root.children);
    });

    it.each([
        ['number', 'fontSize', 0, 100],
        ['boolean', 'uppercase', false, true],
        ['color', 'color', '#000000', '#ffffff'],
    ] as const)('captures %s automation with the existing curve evaluator', (valueType, property, start, end) => {
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('text', property),
            valueType,
            initialKeyframes: [createKeyframe(0, start), createKeyframe(100, end)],
        });
        const state = useSceneStore.getState();
        const ids = [state.nodeIdByElementId.text];
        const atStart = createSceneClipboard(state, ids, 0);
        const atEnd = createSceneClipboard(state, ids, 100);
        expect(atStart.withoutAutomation.elements.text.properties[property]).toEqual({
            type: 'constant',
            value: start,
        });
        expect(atEnd.withoutAutomation.elements.text.properties[property]).toEqual({ type: 'constant', value: end });
        expect(Object.keys(atStart.withoutAutomation.automation.channels)).toHaveLength(0);
        expect(atStart.full.elements.text.properties[property]).toMatchObject({ type: 'keyframes' });
        expect(Object.keys(atStart.full.automation.channels)).toHaveLength(1);
    });

    it('drops empty automation bindings so element defaults remain available', () => {
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('text', 'fontSize'),
            valueType: 'number',
        });
        const state = useSceneStore.getState();
        const clipboard = createSceneClipboard(state, [state.nodeIdByElementId.text], 50);
        expect(clipboard.withoutAutomation.elements.text.properties).not.toHaveProperty('fontSize');
        expect(Object.keys(clipboard.withoutAutomation.automation.channels)).toHaveLength(0);
        const pasted = dispatchSceneCommand({
            type: 'importSubtreeBundle',
            bundle: clipboard.withoutAutomation,
            reuseMacros: true,
        });
        expect(pasted.success).toBe(true);
        const copy = Object.keys(useSceneStore.getState().elements).find((id) => id !== 'text')!;
        expect(useSceneStore.getState().bindings.byElement[copy]).not.toHaveProperty('fontSize');
    });
});
