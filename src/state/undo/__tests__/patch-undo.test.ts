import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { createPatchUndoController } from '@state/undo/patch-undo';

describe('patch-based undo controller', () => {
    let controller: ReturnType<typeof createPatchUndoController> | null = null;

    beforeEach(() => {
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        controller = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
    });

    afterEach(() => {
        controller?.dispose();
        controller = null;
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
    });

    it('tracks add/remove element operations', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'undo.element',
            config: {
                text: { type: 'constant', value: 'Hello Undo' },
            },
        });

        expect(controller?.canUndo()).toBe(true);
        controller?.undo();
        expect(useSceneStore.getState().elements['undo.element']).toBeUndefined();
        expect(controller?.canRedo()).toBe(true);
        controller?.redo();
        expect(useSceneStore.getState().elements['undo.element']).toBeDefined();
        const binding = useSceneStore.getState().bindings.byElement['undo.element'].text;
        expect(binding).toEqual({ type: 'constant', value: 'Hello Undo' });
    });

    it('restores removed elements with original bindings', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'remove.me',
            config: {
                text: { type: 'constant', value: 'Original' },
                visible: { type: 'constant', value: true },
            },
        });
        dispatchSceneCommand({
            type: 'updateElementConfig',
            elementId: 'remove.me',
            patch: {
                text: { type: 'constant', value: 'Updated' },
                visible: { type: 'constant', value: false },
            },
        });
        dispatchSceneCommand({ type: 'removeElement', elementId: 'remove.me' });
        expect(useSceneStore.getState().elements['remove.me']).toBeUndefined();
        controller?.undo();
        const restoredBindings = useSceneStore.getState().bindings.byElement['remove.me'];
        expect(restoredBindings.text).toEqual({ type: 'constant', value: 'Updated' });
        expect(restoredBindings.visible).toEqual({ type: 'constant', value: false });
    });

    it('does not record no-op updates', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'noop',
            config: { text: { type: 'constant', value: 'Stable' } },
        });
        const beforeCanUndo = controller?.canUndo() ?? false;
        // Update with identical value should not push another entry
        dispatchSceneCommand({
            type: 'updateElementConfig',
            elementId: 'noop',
            patch: { text: { type: 'constant', value: 'Stable' } },
        });
        expect(controller?.canUndo()).toBe(beforeCanUndo);
    });

    it('merges transient drag updates into a single undo entry', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'drag-target',
            config: { offsetX: { type: 'constant', value: 0 }, offsetY: { type: 'constant', value: 0 } },
        });

        const mergeKey = 'move:test-drag';
        const baseOptions = {
            source: 'test.drag',
            mergeKey,
            canMergeWith: (other: any) =>
                other.command.type === 'updateElementConfig' && other.command.elementId === 'drag-target',
        };

        dispatchSceneCommand(
            {
                type: 'updateElementConfig',
                elementId: 'drag-target',
                patch: { offsetX: { type: 'constant', value: 10 } },
            },
            { ...baseOptions, transient: true }
        );
        const afterFirst = controller?.debugStack();
        expect(afterFirst?.entries.length).toBe(2);
        expect(afterFirst?.entries[1].mergeKey).toBe(mergeKey);
        expect(afterFirst?.entries[1].transient).toBe(true);

        dispatchSceneCommand(
            {
                type: 'updateElementConfig',
                elementId: 'drag-target',
                patch: { offsetX: { type: 'constant', value: 18 } },
            },
            { ...baseOptions, transient: true }
        );
        const afterSecond = controller?.debugStack();
        expect(afterSecond?.entries.length).toBe(2);
        expect(afterSecond?.entries[1].mergeKey).toBe(mergeKey);
        expect(afterSecond?.entries[1].transient).toBe(true);

        // Finalize drag with identical state; should flip transient to false without adding a new entry
        dispatchSceneCommand(
            {
                type: 'updateElementConfig',
                elementId: 'drag-target',
                patch: { offsetX: { type: 'constant', value: 18 } },
            },
            { ...baseOptions, transient: false }
        );

        const finalized = controller?.debugStack();
        expect(finalized?.entries.length).toBe(2);
        expect(finalized?.entries[1].transient).toBe(false);
    });
});
