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

    it('keeps parity when macro values change after assignment', () => {
        dispatchSceneCommand(
            builder,
            { type: 'createMacro', macroId: 'macro.assign', definition: { type: 'number', value: 0 } },
            { source: 'test:macro-setup', skipParity: true }
        );

        dispatchSceneCommand(
            builder,
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'with-macro',
                config: {
                    id: 'with-macro',
                    offsetX: { type: 'constant', value: 0 },
                },
            },
            { source: 'test:add-element', skipParity: true }
        );

        const builderElement: any = builder.getElement('with-macro');
        expect(builderElement).toBeTruthy();
        builderElement.bindToMacro('offsetX', 'macro.assign');

        const mismatchResult = dispatchSceneCommand(
            builder,
            { type: 'updateMacroValue', macroId: 'macro.assign', value: 21 },
            { source: 'test:update-macro-mismatch', forceParity: true, sampleOverride: 1 }
        );
        expect(mismatchResult.success).toBe(false);
        expect(mismatchResult.parityMismatch).not.toBeNull();

        useSceneStore.getState().updateBindings('with-macro', {
            offsetX: { type: 'macro', macroId: 'macro.assign' },
        });

        const updateResult = dispatchSceneCommand(
            builder,
            { type: 'updateMacroValue', macroId: 'macro.assign', value: 42 },
            { source: 'test:update-macro', forceParity: true, sampleOverride: 1 }
        );

        expect(updateResult.success).toBe(true);
        expect(updateResult.parityMismatch).toBeNull();
    });
});
