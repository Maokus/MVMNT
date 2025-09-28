import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import {
    dispatchSceneCommand,
    registerSceneCommandListener,
    clearSceneCommandListeners,
    type SceneCommandTelemetryEvent,
} from '@state/scene';
import { loadDefaultScene } from '@core/default-scene-loader';
import { useSceneStore } from '@state/sceneStore';

function resetState() {
    useSceneStore.getState().clearScene();
    useSceneStore.getState().replaceMacros(null);
}

describe('scene command gateway', () => {
    beforeEach(() => {
        resetState();
    });

    afterEach(() => {
        clearSceneCommandListeners();
    });

    it('adds elements via command and updates store bindings', () => {
        const result = dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-1',
                config: { id: 'element-1', text: { type: 'constant', value: 'Hello' } },
            },
        );

        expect(result.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toEqual(['element-1']);
        expect(store.bindings.byElement['element-1'].text).toEqual({ type: 'constant', value: 'Hello' });
    });

    it('updates element configuration and keeps parity with store', () => {
        dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-2',
                config: { id: 'element-2', text: { type: 'constant', value: 'Hello' } },
            },
        );

        const updateResult = dispatchSceneCommand(
            {
                type: 'updateElementConfig',
                elementId: 'element-2',
                patch: { visible: false },
            },
        );

        expect(updateResult.success).toBe(true);
        const state = useSceneStore.getState();
        expect(state.bindings.byElement['element-2'].visible).toEqual({ type: 'constant', value: false });
    });

    it('removes elements and clears store state', () => {
        dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-3',
                config: { id: 'element-3' },
            },
        );

        const removeResult = dispatchSceneCommand(
            { type: 'removeElement', elementId: 'element-3' },
        );

        expect(removeResult.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toHaveLength(0);
        expect(store.elements['element-3']).toBeUndefined();
    });

    it('applies commands when running in store-only mode', () => {
        const result = dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'store-only',
                config: { id: 'store-only', text: { type: 'constant', value: 'Store Only' } },
            },
        );

        expect(result.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toContain('store-only');
        expect(store.bindings.byElement['store-only'].text).toEqual({
            type: 'constant',
            value: 'Store Only',
        });
    });

    it('emits telemetry for store-only command execution', () => {
        const events: SceneCommandTelemetryEvent[] = [];
        const unregister = registerSceneCommandListener((event) => {
            events.push(event);
        });

        const result = dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'telemetry-element',
            },
            { source: 'test-suite' },
        );

        unregister();

        expect(result.success).toBe(true);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            success: true,
            command: { type: 'addElement', elementId: 'telemetry-element' },
            source: 'test-suite',
        });
        expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('routes macro commands through the gateway and keeps store/macros in sync', () => {
        const createResult = dispatchSceneCommand(
            { type: 'createMacro', macroId: 'macro.test', definition: { type: 'number', value: 4 } },
        );
        expect(createResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(4);

        const updateResult = dispatchSceneCommand(
            { type: 'updateMacroValue', macroId: 'macro.test', value: 9 },
        );
        expect(updateResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(9);

        const deleteResult = dispatchSceneCommand(
            { type: 'deleteMacro', macroId: 'macro.test' },
        );
        expect(deleteResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']).toBeUndefined();
    });

    it('hydrates default scene macros into the scene store', async () => {
        const loaded = await loadDefaultScene('commandGateway.test');
        expect(loaded).toBe(true);
        const sceneMacros = useSceneStore.getState().macros.byId;
        expect(sceneMacros['midiTrack']).toBeDefined();
        expect(sceneMacros['noteAnimation']).toBeDefined();
    });
});
