import { describe, beforeEach, it, expect } from 'vitest';
import { HybridSceneBuilder } from '@core/scene-builder';
import { dispatchSceneCommand, synchronizeSceneStoreFromBuilder } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { globalMacroManager } from '@bindings/macro-manager';

function resetState() {
    globalMacroManager.clearMacros();
    useSceneStore.getState().clearScene();
    useSceneStore.getState().replaceMacros(null);
}

describe('scene command gateway', () => {
    beforeEach(() => {
        resetState();
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

    it('applies commands when no builder is provided', () => {
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

    it('synchronizes store from existing builder snapshot', () => {
        const builder = new HybridSceneBuilder();
        builder.clearScene();
        globalMacroManager.clearMacros();
        builder.addElementFromRegistry('textOverlay', { id: 'sync-test', text: { type: 'constant', value: 'Sync' } });

        const syncResult = synchronizeSceneStoreFromBuilder(builder, { source: 'test:sync' });
        expect(syncResult.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toEqual(['sync-test']);
        expect(store.bindings.byElement['sync-test'].text).toEqual({ type: 'constant', value: 'Sync' });
    });

    it('routes macro commands through the gateway and keeps store/macros in sync', () => {
        const createResult = dispatchSceneCommand(
            { type: 'createMacro', macroId: 'macro.test', definition: { type: 'number', value: 4 } },
        );
        expect(createResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')?.value).toBe(4);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(4);

        const updateResult = dispatchSceneCommand(
            { type: 'updateMacroValue', macroId: 'macro.test', value: 9 },
        );
        expect(updateResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')?.value).toBe(9);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(9);

        const deleteResult = dispatchSceneCommand(
            { type: 'deleteMacro', macroId: 'macro.test' },
        );
        expect(deleteResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')).toBeNull();
        expect(useSceneStore.getState().macros.byId['macro.test']).toBeUndefined();
    });
});
