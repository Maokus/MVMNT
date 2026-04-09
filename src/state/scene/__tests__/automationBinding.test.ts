import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';
import { resetMacroStoreBinding, setMacroStoreBinding } from '@state/scene/macroSyncService';
import { SceneRuntimeAdapter } from '@state/scene/runtimeAdapter';
import { makeChannelId, createChannel } from '@automation/types';

describe('SceneRuntimeAdapter: automation binding', () => {
    let store: ReturnType<typeof createSceneStore>;
    let adapter: SceneRuntimeAdapter;

    beforeEach(() => {
        store = createSceneStore();
        setMacroStoreBinding(store);
        store.getState().importScene(fixture as any);
        adapter = new SceneRuntimeAdapter({ store });
    });

    afterEach(() => {
        adapter.dispose();
        resetMacroStoreBinding();
    });

    it('should handle enablePropertyAutomation without errors', () => {
        const state = store.getState();
        const elementId = state.order[0]; // First element
        const propertyKey = 'visible';
        const channelId = makeChannelId(elementId, propertyKey);

        // Get current binding value
        const currentBinding = state.bindings.byElement[elementId]?.[propertyKey];
        console.log('Current binding:', JSON.stringify(currentBinding));
        console.log('Element ID:', elementId);
        console.log('Element type:', state.elements[elementId]?.type);

        // Create channel
        const channel = createChannel(elementId, propertyKey, 'boolean', 'stepped');
        channel.keyframes = [
            { tick: 0, value: true, easingId: 'linear' },
            { tick: 100, value: false, easingId: 'linear' },
        ];

        const consoleSpy = vi.spyOn(console, 'error');

        // Step 1: Add the automation channel
        store.getState().setAutomationChannel(channel);

        // Step 2: Switch binding to keyframes
        store.getState().updateBindings(elementId, {
            [propertyKey]: { type: 'keyframes', channelId },
        });

        // Check for errors
        const errors = consoleSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[SceneRuntimeAdapter]')
        );
        console.log('SceneRuntimeAdapter errors:', errors);
        expect(errors).toHaveLength(0);
    });

    it('should handle enablePropertyAutomation for numeric property', () => {
        const state = store.getState();
        const elementId = state.order[0];
        const propertyKey = 'offsetX';
        const channelId = makeChannelId(elementId, propertyKey);

        const channel = createChannel(elementId, propertyKey, 'number', 'eased');
        channel.keyframes = [
            { tick: 0, value: 0, easingId: 'linear' },
            { tick: 100, value: 100, easingId: 'linear' },
        ];

        const consoleSpy = vi.spyOn(console, 'error');

        store.getState().setAutomationChannel(channel);
        store.getState().updateBindings(elementId, {
            [propertyKey]: { type: 'keyframes', channelId },
        });

        const errors = consoleSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[SceneRuntimeAdapter]')
        );
        console.log('SceneRuntimeAdapter errors:', errors);
        expect(errors).toHaveLength(0);
    });

    it('should handle enablePropertyAutomation for color property', () => {
        const state = store.getState();
        const elementId = state.order[0];
        const propertyKey = 'color';
        const channelId = makeChannelId(elementId, propertyKey);

        const channel = createChannel(elementId, propertyKey, 'color', 'linear');
        channel.keyframes = [
            { tick: 0, value: '#ff0000', easingId: 'linear' },
            { tick: 100, value: '#0000ff', easingId: 'linear' },
        ];

        const consoleSpy = vi.spyOn(console, 'error');

        store.getState().setAutomationChannel(channel);
        store.getState().updateBindings(elementId, {
            [propertyKey]: { type: 'keyframes', channelId },
        });

        const errors = consoleSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[SceneRuntimeAdapter]')
        );
        console.log('SceneRuntimeAdapter errors:', errors);
        expect(errors).toHaveLength(0);
    });
});
