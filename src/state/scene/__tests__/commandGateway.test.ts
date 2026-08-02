import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import {
    dispatchSceneCommand,
    registerSceneCommandListener,
    clearSceneCommandListeners,
    type SceneCommandTelemetryEvent,
} from '@state/scene';
import { loadDefaultScene } from '@core/default-scene-loader';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';

function resetState() {
    useSceneStore.getState().clearScene();
    useSceneStore.getState().replaceMacros(null);
}

describe('scene command gateway', () => {
    beforeEach(() => {
        resetState();
        useTimelineStore.getState().resetTimeline();
    });

    afterEach(() => {
        clearSceneCommandListeners();
        useTimelineStore.getState().resetTimeline();
    });

    it('adds elements via command and updates store bindings', () => {
        const result = dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'element-1',
            config: { id: 'element-1', text: { type: 'constant', value: 'Hello' } },
        });

        expect(result.success).toBe(true);
        expect(result.patch?.redo[0]).toMatchObject({ type: 'addElement', elementId: 'element-1' });
        expect(result.patch?.undo[0]).toMatchObject({ type: 'loadSerializedScene' });
        const store = useSceneStore.getState();
        expect(store.order).toEqual(['element-1']);
        expect(store.bindings.byElement['element-1'].text).toEqual({ type: 'constant', value: 'Hello' });
    });

    it('updates element configuration and keeps parity with store', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'element-2',
            config: { id: 'element-2', text: { type: 'constant', value: 'Hello' } },
        });

        const updateResult = dispatchSceneCommand({
            type: 'updateElementConfig',
            elementId: 'element-2',
            patch: { visible: false },
        });

        expect(updateResult.success).toBe(true);
        const state = useSceneStore.getState();
        expect(state.bindings.byElement['element-2'].visible).toEqual({ type: 'constant', value: false });
    });

    it('applies a batch atomically and captures one exact snapshot for undo', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'batch-element' });
        const result = dispatchSceneCommand({
            type: 'batch',
            commands: [
                { type: 'updateElementConfig', elementId: 'batch-element', patch: { offsetX: 12 } },
                { type: 'updateElementConfig', elementId: 'batch-element', patch: { offsetY: 24 } },
            ],
        });
        expect(result.success).toBe(true);
        expect(result.patch?.redo).toHaveLength(1);
        expect(result.patch?.redo[0]).toMatchObject({ type: 'batch' });
        expect(result.patch?.undo).toHaveLength(1);
        expect(result.patch?.undo[0]).toMatchObject({ type: 'loadSerializedScene' });
        expect(useSceneStore.getState().bindings.byElement['batch-element']).toMatchObject({
            offsetX: { type: 'constant', value: 12 },
            offsetY: { type: 'constant', value: 24 },
        });
    });

    it('rolls back every persistent change when a batch child fails', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'atomic-element' });
        const before = useSceneStore.getState().exportSceneDraft();
        const result = dispatchSceneCommand({
            type: 'batch',
            commands: [
                { type: 'updateElementConfig', elementId: 'atomic-element', patch: { offsetX: 99 } },
                { type: 'updateElementConfig', elementId: 'missing-element', patch: { offsetY: 10 } },
            ],
        });
        expect(result.success).toBe(false);
        expect(useSceneStore.getState().exportSceneDraft()).toEqual(before);
    });

    it('removes elements and clears store state', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'element-3',
            config: { id: 'element-3' },
        });

        const removeResult = dispatchSceneCommand({ type: 'removeElement', elementId: 'element-3' });

        expect(removeResult.success).toBe(true);
        const store = useSceneStore.getState();
        expect(store.order).toHaveLength(0);
        expect(store.elements['element-3']).toBeUndefined();
    });

    it('applies commands when running in store-only mode', () => {
        const result = dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'store-only',
            config: { id: 'store-only', text: { type: 'constant', value: 'Store Only' } },
        });

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
            { source: 'test-suite' }
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

    it('does not auto-assign audio tracks when adding audio elements', () => {
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                audioTrackA: {
                    id: 'audioTrackA',
                    name: 'Audio Track A',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [],
                    gain: 1,
                },
            },
            tracksOrder: ['audioTrackA'],
        }));

        const result = dispatchSceneCommand({
            type: 'addElement',
            elementType: 'audioSpectrum',
            elementId: 'spectrum-1',
        });

        expect(result.success).toBe(true);
        const binding = useSceneStore.getState().bindings.byElement['spectrum-1'].audioTrackId;
        expect(binding).toEqual({ type: 'constant', value: null });
    });

    it('routes macro commands through the gateway and keeps store/macros in sync', () => {
        const createResult = dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.test',
            definition: { type: 'number', value: 4 },
        });
        expect(createResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(4);

        const updateResult = dispatchSceneCommand({ type: 'updateMacroValue', macroId: 'macro.test', value: 9 });
        expect(updateResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']?.value).toBe(9);

        const renameResult = dispatchSceneCommand({
            type: 'renameMacro',
            currentId: 'macro.test',
            nextId: 'macro.renamed',
        });
        expect(renameResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.test']).toBeUndefined();
        expect(useSceneStore.getState().macros.byId['macro.renamed']).toBeDefined();

        const deleteResult = dispatchSceneCommand({ type: 'deleteMacro', macroId: 'macro.renamed' });
        expect(deleteResult.success).toBe(true);
        expect(useSceneStore.getState().macros.byId['macro.renamed']).toBeUndefined();
    });

    it('groups and deletes a subtree atomically with an exact restore snapshot', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'group-a' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'group-b' });
        const before = useSceneStore.getState();
        const nodeIds = [before.nodeIdByElementId['group-a'], before.nodeIdByElementId['group-b']];
        const group = dispatchSceneCommand({ type: 'groupNodes', nodeIds, groupId: 'group:test' });
        expect(group.success).toBe(true);
        expect(useSceneStore.getState().graph.nodesById['group:test']).toMatchObject({
            kind: 'group',
            children: nodeIds,
        });

        const removed = dispatchSceneCommand({ type: 'deleteSubtrees', nodeIds: ['group:test'] });
        expect(removed.success).toBe(true);
        expect(useSceneStore.getState().elements['group-a']).toBeUndefined();
        expect(useSceneStore.getState().elements['group-b']).toBeUndefined();
        expect(removed.patch?.undo).toHaveLength(1);

        const restored = dispatchSceneCommand(removed.patch!.undo[0]);
        expect(restored.success).toBe(true);
        expect(useSceneStore.getState().graph.nodesById['group:test']).toMatchObject({ kind: 'group' });
        expect(useSceneStore.getState().elements).toHaveProperty('group-a');
        expect(useSceneStore.getState().elements).toHaveProperty('group-b');
    });

    it.skip('hydrates default scene macros into the scene store', async () => {
        const loaded = await loadDefaultScene('commandGateway.test');
        expect(loaded).toBe(true);
        const sceneMacros = useSceneStore.getState().macros.byId;
        expect(sceneMacros['midiTrack']).toBeDefined();
        expect(sceneMacros['noteAnimation']).toBeDefined();
    });
});
