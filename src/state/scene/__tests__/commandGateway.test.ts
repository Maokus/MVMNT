import { describe, beforeEach, it, expect } from 'vitest';
import { HybridSceneBuilder } from '@core/scene-builder';
import { dispatchSceneCommand, synchronizeSceneStoreFromBuilder } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { globalMacroManager } from '@bindings/macro-manager';

function resetState(builder: HybridSceneBuilder) {
    builder.clearScene();
    globalMacroManager.clearMacros();
    useSceneStore.getState().clearScene();
    useSceneStore.getState().replaceMacros(null);
}

describe('scene command gateway', () => {
    let builder: HybridSceneBuilder;

    beforeEach(() => {
        builder = new HybridSceneBuilder();
        resetState(builder);
    });

    it('adds elements via command and updates store bindings', () => {
        const result = dispatchSceneCommand(
            builder,
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-1',
                config: { id: 'element-1', text: { type: 'constant', value: 'Hello' } },
            },
            { source: 'test:add', forceParity: true, sampleOverride: 1 }
        );

        expect(result.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toEqual(['element-1']);
        expect(store.bindings.byElement['element-1'].text).toEqual({ type: 'constant', value: 'Hello' });
        expect(builder.getElement('element-1')).toBeTruthy();
    });

    it('updates element configuration and keeps parity with store', () => {
        dispatchSceneCommand(
            builder,
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-2',
                config: { id: 'element-2', text: { type: 'constant', value: 'Hello' } },
            },
            { source: 'test:setup', skipParity: true }
        );

        const updateResult = dispatchSceneCommand(
            builder,
            {
                type: 'updateElementConfig',
                elementId: 'element-2',
                patch: { visible: false },
            },
            { source: 'test:update', forceParity: true, sampleOverride: 1 }
        );

        expect(updateResult.success).toBe(true);
        const state = useSceneStore.getState();
        expect(state.bindings.byElement['element-2'].visible).toEqual({ type: 'constant', value: false });
    });

    it('removes elements and clears store state', () => {
        dispatchSceneCommand(
            builder,
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'element-3',
                config: { id: 'element-3' },
            },
            { source: 'test:add', skipParity: true }
        );

        const removeResult = dispatchSceneCommand(
            builder,
            { type: 'removeElement', elementId: 'element-3' },
            { source: 'test:remove', forceParity: true, sampleOverride: 1 }
        );

        expect(removeResult.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toHaveLength(0);
        expect(store.elements['element-3']).toBeUndefined();
    });

    it('synchronizes store from existing builder snapshot', () => {
        builder.clearScene();
        globalMacroManager.clearMacros();
        builder.addElementFromRegistry('textOverlay', { id: 'sync-test', text: { type: 'constant', value: 'Sync' } });

        const syncResult = synchronizeSceneStoreFromBuilder(builder, { source: 'test:sync', forceParity: true, sampleOverride: 1 });
        expect(syncResult.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toEqual(['sync-test']);
        expect(store.bindings.byElement['sync-test'].text).toEqual({ type: 'constant', value: 'Sync' });
    });

    it('routes macro commands through the gateway and keeps store/macros in sync', () => {
        const createResult = dispatchSceneCommand(
            builder,
            { type: 'createMacro', macroId: 'macro.test', definition: { type: 'number', value: 4 } },
            { source: 'test:macro-create', skipParity: true }
        );
        expect(createResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')?.value).toBe(4);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(4);

        const updateResult = dispatchSceneCommand(
            builder,
            { type: 'updateMacroValue', macroId: 'macro.test', value: 9 },
            { source: 'test:macro-update', skipParity: true }
        );
        expect(updateResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')?.value).toBe(9);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(9);

        const deleteResult = dispatchSceneCommand(
            builder,
            { type: 'deleteMacro', macroId: 'macro.test' },
            { source: 'test:macro-delete', skipParity: true }
        );
        expect(deleteResult.success).toBe(true);
        expect(globalMacroManager.getMacro('macro.test')).toBeNull();
        expect(useSceneStore.getState().macros.byId['macro.test']).toBeUndefined();
    });
});
