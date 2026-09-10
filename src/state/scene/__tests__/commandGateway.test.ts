import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import {
    dispatchSceneCommand,
    registerSceneCommandListener,
    clearSceneCommandListeners,
    createSceneSubtreeBundle,
    type SceneCommandTelemetryEvent,
} from '@state/scene';
import { loadDefaultScene } from '@core/default-scene-loader';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { deriveElementOrder } from '@state/scene-graph';
import { elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import type { FontAsset } from '@state/scene/fonts';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';

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

    it('treats a cleared scene as an initialized blank document', () => {
        const result = dispatchSceneCommand({ type: 'clearScene' });

        expect(result.success).toBe(true);
        expect(deriveElementOrder(useSceneStore.getState().graph)).toEqual([]);
        expect(useSceneEditorStore.getState().hasInitializedScene).toBe(true);
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
        expect(deriveElementOrder(store.graph)).toEqual(['element-1']);
        expect(store.bindings.byElement['element-1'].text).toEqual({ type: 'constant', value: 'Hello' });
        const node = store.graph.nodesById[store.nodeIdByElementId['element-1']];
        expect(node.userNodeTransform).toMatchObject({
            translationX: store.settings.width / 2,
            translationY: store.settings.height / 2,
        });
        expect(store.bindings.byElement['element-1'].offsetX).toBeUndefined();
        expect(store.bindings.byElement['element-1'].offsetY).toBeUndefined();
    });

    it('maps explicit legacy spawn coordinates into the host node transform', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'image',
            elementId: 'positioned-image',
            config: { offsetX: 125, offsetY: 240 },
        });

        const state = useSceneStore.getState();
        const node = state.graph.nodesById[state.nodeIdByElementId['positioned-image']];
        expect(node.userNodeTransform).toMatchObject({ translationX: 125, translationY: 240 });
        expect(state.bindings.byElement['positioned-image'].offsetX).toBeUndefined();
        expect(state.bindings.byElement['positioned-image'].offsetY).toBeUndefined();
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

    it('does not advance the document revision for a semantic no-op', () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'revision-noop',
            config: { text: 'Stable' },
        });
        const revision = useDocumentRevisionStore.getState().revision;

        dispatchSceneCommand({
            type: 'updateElementConfig',
            elementId: 'revision-noop',
            patch: { text: 'Stable' },
        });

        expect(useDocumentRevisionStore.getState().revision).toBe(revision);
    });

    it('updates and restores the host-owned element output blend mode', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'basicShapes', elementId: 'blend-shape' });
        const nodeId = useSceneStore.getState().nodeIdByElementId['blend-shape'];

        const result = dispatchSceneCommand({ type: 'setNodeOutputBlendMode', nodeId, mode: 'multiply' });

        expect(result.success).toBe(true);
        expect(useSceneStore.getState().graph.nodesById[nodeId]).toMatchObject({ outputBlendMode: 'multiply' });
        dispatchSceneCommand(result.patch!.undo[0]);
        expect(useSceneStore.getState().graph.nodesById[nodeId]).toMatchObject({ outputBlendMode: 'source-over' });
    });

    it('retains custom font metadata when undoing a text element edit', () => {
        const font: FontAsset = {
            id: 'font-custom',
            family: 'Custom Family',
            originalFileName: 'Custom.ttf',
            fileSize: 1024,
            createdAt: 1,
            updatedAt: 1,
            licensingAcknowledged: true,
            variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
        };
        useSceneStore.getState().registerFontAsset(font);
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'font-text' });

        const result = dispatchSceneCommand({
            type: 'updateNodeTransform',
            nodeId: useSceneStore.getState().nodeIdByElementId['font-text'],
            transform: { translationX: 24 },
        });

        expect(result.success).toBe(true);
        expect(dispatchSceneCommand(result.patch!.undo[0]).success).toBe(true);
        expect(useSceneStore.getState().fonts.assets[font.id]).toMatchObject(font);
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

    it('resolves matching missing font tokens everywhere when a font is registered', () => {
        const asset: FontAsset = {
            id: 'reconnected-font',
            family: 'Noto Sans',
            originalFileName: 'NotoSans.ttf',
            fileSize: 1024,
            createdAt: 1,
            updatedAt: 1,
            licensingAcknowledged: true,
            variants: [
                { id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' },
                { id: 'bold-italic', weight: 700, style: 'italic', sourceFormat: 'ttf' },
            ],
        };
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'font-element',
            config: { fontFamily: 'MissingGoogle:Noto Sans|700i' },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'font-macro',
            definition: { type: 'font', value: 'MissingProject:Noto Sans|400' },
        });
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('font-element', 'fontFamily'),
            valueType: 'string',
            initialKeyframes: [
                {
                    tick: 0,
                    value: 'MissingGoogle:Noto Sans|700i',
                    segmentInterpolation: { mode: 'constant', direction: 'auto' },
                },
            ],
        });

        const result = dispatchSceneCommand({
            type: 'batch',
            commands: [
                { type: 'registerFontAsset', asset },
                { type: 'resolveMissingFontTokens', asset },
            ],
        });

        expect(result.success).toBe(true);
        expect(result.patch?.undo).toHaveLength(1);
        const state = useSceneStore.getState();
        expect(state.macros.byId['font-macro'].value).toBe('Project:reconnected-font|400');
        const fontAutomation = Object.values(state.automation.channels).find(
            (channel) => channel.target.owner.kind === 'element' && channel.target.owner.id === 'font-element'
        );
        expect(fontAutomation?.keyframes[0].value).toBe('Project:reconnected-font|700i');

        expect(dispatchSceneCommand(result.patch!.undo[0]).success).toBe(true);
        expect(useSceneStore.getState().macros.byId['font-macro'].value).toBe('MissingProject:Noto Sans|400');
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

    it('rolls back declared external boundaries when a transaction fails', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'atomic-document' });
        useSceneMetadataStore.getState().setName('Before transaction');
        useTimelineStore.setState({ playbackRange: { startTick: 10, endTick: 20 }, playbackRangeUserDefined: true });
        useVisualAssetRegistryStore.getState().addPluginEntry('asset:one', 'Asset', 'blob:asset', 'image');

        const result = dispatchSceneCommand({
            type: 'batch',
            commands: [
                { type: 'clearScene' },
                { type: 'updateElementConfig', elementId: 'missing-element', patch: { text: 'fail' } },
            ],
        });

        expect(result.success).toBe(false);
        expect(useSceneStore.getState().elements['atomic-document']).toBeDefined();
        expect(useSceneMetadataStore.getState().metadata.name).toBe('Before transaction');
        expect(useTimelineStore.getState().playbackRange).toEqual({ startTick: 10, endTick: 20 });
        expect(useVisualAssetRegistryStore.getState().assets['asset:one']).toBeDefined();
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
        expect(deriveElementOrder(store.graph)).toHaveLength(0);
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
        expect(deriveElementOrder(store.graph)).toContain('store-only');
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

    it('reparents nested subtrees as one undoable command', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'move-a' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'move-b' });
        const initial = useSceneStore.getState();
        const a = initial.nodeIdByElementId['move-a'];
        const b = initial.nodeIdByElementId['move-b'];
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: [a], groupId: 'group:a' });
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: [b], groupId: 'group:b' });
        const result = dispatchSceneCommand({
            type: 'reparentNodes',
            nodeIds: [a],
            newParentId: 'group:b',
            targetIndex: 0,
        });
        expect(result.success).toBe(true);
        expect(result.patch?.undo).toHaveLength(1);
        expect(useSceneStore.getState().graph.nodesById[a].parentId).toBe('group:b');
        dispatchSceneCommand(result.patch!.undo[0]);
        expect(useSceneStore.getState().graph.nodesById[a].parentId).toBe('group:a');

        const beforeCycle = useSceneStore.getState().exportSceneDraft();
        const cycle = dispatchSceneCommand({
            type: 'reparentNodes',
            nodeIds: ['group:b'],
            newParentId: 'group:b',
            targetIndex: 0,
        });
        expect(cycle.success).toBe(false);
        expect(useSceneStore.getState().exportSceneDraft()).toEqual(beforeCycle);
    });

    it('duplicates a nested subtree with independent element and automation ownership', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'original-a' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'original-b' });
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('original-a', 'offsetX'),
            valueType: 'number',
            initialKeyframes: [{ tick: 0, value: 12, segmentInterpolation: { mode: 'linear', direction: 'auto' } }],
        });
        const scene = useSceneStore.getState();
        const a = scene.nodeIdByElementId['original-a'];
        const b = scene.nodeIdByElementId['original-b'];
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: [a], groupId: 'nested:inner' });
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: ['nested:inner', b], groupId: 'nested:outer' });
        const result = dispatchSceneCommand({
            type: 'duplicateSubtrees',
            nodeIds: ['nested:outer'],
            mappings: {
                nodeIdMap: {
                    'nested:outer': 'copy:outer',
                    'nested:inner': 'copy:inner',
                    [a]: 'copy:a',
                    [b]: 'copy:b',
                },
                elementIdMap: { 'original-a': 'copy-a', 'original-b': 'copy-b' },
            },
        });
        expect(result.success).toBe(true);
        const copied = useSceneStore.getState();
        expect(copied.graph.nodesById['copy:a']).toMatchObject({ parentId: 'copy:inner', elementId: 'copy-a' });
        const originalChannel = Object.values(copied.automation.channels).find(
            (channel) => channel.target.owner.id === 'original-a' && channel.target.propertyPath === 'offsetX'
        );
        const copiedChannel = Object.values(copied.automation.channels).find(
            (channel) => channel.target.owner.id === 'copy-a' && channel.target.propertyPath === 'offsetX'
        );
        expect(copiedChannel?.keyframes).toEqual(originalChannel?.keyframes);
        expect(copiedChannel).not.toBe(originalChannel);
        expect(copiedChannel?.id).not.toBe(originalChannel?.id);
    });

    it('cleans up structured node targets with a subtree and restores them exactly on undo', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'child' });
        const childNode = useSceneStore.getState().nodeIdByElementId.child;
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: [childNode], groupId: 'group:animated' });
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: nodePropertyTarget('group:animated', 'translationX'),
            valueType: 'number',
            initialKeyframes: [{ tick: 0, value: 25, segmentInterpolation: { mode: 'linear', direction: 'auto' } }],
        });
        dispatchSceneCommand({ type: 'createMacro', macroId: 'group-scale', definition: { type: 'number', value: 2 } });
        dispatchSceneCommand({
            type: 'updatePropertyTargetBinding',
            target: nodePropertyTarget('group:animated', 'scaleX'),
            binding: { type: 'macro', macroId: 'group-scale' },
        });
        const before = useSceneStore.getState().exportSceneDraft();

        const deletion = dispatchSceneCommand({ type: 'deleteSubtrees', nodeIds: ['group:animated'] });
        expect(deletion.success).toBe(true);
        expect(useSceneStore.getState().nodeBindings['group:animated']).toBeUndefined();
        expect(
            Object.values(useSceneStore.getState().automation.channels).some(
                (channel) => channel.target.owner.kind === 'node' && channel.target.owner.id === 'group:animated'
            )
        ).toBe(false);

        dispatchSceneCommand(deletion.patch!.undo[0]);
        expect(useSceneStore.getState().exportSceneDraft()).toEqual(before);
    });

    it('imports a portable subtree atomically with remapped nodes, elements, macros, and channels', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'portable-element' });
        const elementNodeId = useSceneStore.getState().nodeIdByElementId['portable-element'];
        dispatchSceneCommand({
            type: 'groupNodes',
            nodeIds: [elementNodeId],
            groupId: 'portable-group',
            name: 'Portable group',
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'portable-scale',
            definition: { type: 'number', value: 2 },
        });
        dispatchSceneCommand({
            type: 'updatePropertyTargetBinding',
            target: nodePropertyTarget('portable-group', 'scaleX'),
            binding: { type: 'macro', macroId: 'portable-scale' },
        });
        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: nodePropertyTarget('portable-group', 'translationX'),
            valueType: 'number',
            initialKeyframes: [{ tick: 0, value: 40, segmentInterpolation: { mode: 'linear', direction: 'auto' } }],
        });
        const bundle = createSceneSubtreeBundle(useSceneStore.getState(), ['portable-group']);
        const before = useSceneStore.getState().exportSceneDraft();

        const imported = dispatchSceneCommand({ type: 'importSubtreeBundle', bundle });

        expect(imported.success).toBe(true);
        const state = useSceneStore.getState();
        const copiedGroup = Object.values(state.graph.nodesById).find(
            (node) => node.kind === 'group' && node.id !== 'portable-group' && node.name === 'Portable group_1'
        );
        expect(copiedGroup).toBeDefined();
        expect(copiedGroup && 'children' in copiedGroup ? copiedGroup.children : []).toHaveLength(1);
        const copiedBinding = state.nodeBindings[copiedGroup!.id];
        expect(copiedBinding.scaleX).toEqual({ type: 'macro', macroId: 'portable-scale copy 2' });
        const copiedChannel = Object.values(state.automation.channels).find(
            (channel) => channel.target.owner.kind === 'node' && channel.target.owner.id === copiedGroup!.id
        );
        expect(copiedChannel?.target.propertyPath).toBe('translationX');
        expect(copiedChannel?.keyframes[0]?.value).toBe(40);
        expect(state.macros.byId['portable-scale copy 2']?.value).toBe(2);
        expect(Object.keys(state.elements)).toContain('portable-element copy 2');

        dispatchSceneCommand(imported.patch!.undo[0]);
        expect(useSceneStore.getState().exportSceneDraft()).toEqual(before);
    });

    it.skip('hydrates default scene macros into the scene store', async () => {
        const loaded = await loadDefaultScene('commandGateway.test');
        expect(loaded).toBe(true);
        const sceneMacros = useSceneStore.getState().macros.byId;
        expect(sceneMacros['midiTrack']).toBeDefined();
        expect(sceneMacros['noteAnimation']).toBeDefined();
    });
});
