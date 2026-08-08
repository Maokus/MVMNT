import { beforeEach, describe, expect, it } from 'vitest';
import { createKeyframe, elementPropertyTarget } from '@automation/types';
import { DocumentGateway } from '@persistence/document-gateway';
import { AutosaveVersionStore } from '@persistence/autosave-version-store';
import { exportScene, importScene } from '..';
import { createSceneSubtreeBundle, dispatchSceneCommand } from '@state/scene';
import { createSceneSnapshot, useSceneStore } from '@state/sceneStore';
import type { FontAsset } from '@state/scene/fonts';

const font: FontAsset = {
    id: 'snapshot-contract-font',
    family: 'Snapshot Contract',
    originalFileName: 'snapshot-contract.ttf',
    fileSize: 1024,
    createdAt: 1,
    updatedAt: 2,
    licensingAcknowledged: true,
    variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
};

function seedPersistentScene() {
    const add = dispatchSceneCommand({
        type: 'addElement',
        elementType: 'textOverlay',
        elementId: 'snapshot-contract',
    });
    expect(add.success).toBe(true);
    const store = useSceneStore.getState();
    const nodeId = store.nodeIdByElementId['snapshot-contract'];
    store.registerFontAsset(font);
    store.acknowledgeFontLicensing(99);
    store.createMacro('snapshot-contract-macro', { type: 'number', value: 0.5 });
    store.updateNodeBindings(nodeId, { translationX: { type: 'macro', macroId: 'snapshot-contract-macro' } });
    store.setAutomationChannel({
        id: 'snapshot-contract-channel',
        target: elementPropertyTarget('snapshot-contract', 'opacity'),
        valueType: 'number',
        keyframes: [createKeyframe(0, 1)],
    });
    store.updateBindings('snapshot-contract', {
        opacity: { type: 'keyframes', channelId: 'snapshot-contract-channel' },
    });
}

describe('canonical scene snapshot contract', () => {
    beforeEach(async () => {
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        await AutosaveVersionStore.clear();
    });

    it('preserves every persistent scene slice through undo and document application', () => {
        seedPersistentScene();
        const expected = createSceneSnapshot(useSceneStore.getState());
        const nodeId = useSceneStore.getState().nodeIdByElementId['snapshot-contract'];

        const change = dispatchSceneCommand({ type: 'updateNodeTransform', nodeId, transform: { translationX: 42 } });
        expect(change.success).toBe(true);
        expect(dispatchSceneCommand(change.patch!.undo[0]).success).toBe(true);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(expected);

        const document = DocumentGateway.build();
        useSceneStore.getState().clearScene();
        DocumentGateway.apply(document);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(expected);
    });

    it('round-trips the canonical persistent slices through the packaged document adapter', async () => {
        seedPersistentScene();
        const expected = createSceneSnapshot(useSceneStore.getState());

        const exported = await exportScene();
        if (!exported.ok || exported.mode !== 'zip-package') throw new Error('Expected a packaged scene export');

        useSceneStore.getState().clearScene();
        const imported = await importScene(exported.zip);
        expect(imported.ok).toBe(true);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(expected);
    });

    it('round-trips the canonical persistent slices through recovery storage', async () => {
        seedPersistentScene();
        const expected = createSceneSnapshot(useSceneStore.getState());
        const exported = await exportScene('Snapshot contract recovery');
        if (!exported.ok || exported.mode !== 'zip-package') throw new Error('Expected a packaged scene export');

        const version = await AutosaveVersionStore.save('Snapshot contract recovery', exported.zip, exported.digest);
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        const recoveryBytes = await AutosaveVersionStore.load(version.id);
        expect(recoveryBytes).not.toBeNull();
        const imported = await importScene(recoveryBytes!);

        expect(imported.ok).toBe(true);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(expected);
    });

    it('transfers every subtree-applicable persistent slice without runtime state', () => {
        seedPersistentScene();
        const source = createSceneSnapshot(useSceneStore.getState());
        const sourceNodeId = useSceneStore.getState().nodeIdByElementId['snapshot-contract'];
        const bundle = createSceneSubtreeBundle(useSceneStore.getState(), [sourceNodeId]);

        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        const transferred = dispatchSceneCommand({ type: 'importSubtreeBundle', bundle });
        expect(transferred.success).toBe(true);

        const snapshot = createSceneSnapshot(useSceneStore.getState());
        const [transferredChannel] = Object.values(snapshot.automation?.channels ?? {});
        const expectedElements = structuredClone(source.elements);
        expectedElements['snapshot-contract'].properties.opacity = {
            type: 'keyframes',
            channelId: transferredChannel.id,
        };
        expect(snapshot.elements).toEqual(expectedElements);
        expect(snapshot.nodeBindings).toEqual(source.nodeBindings);
        expect(snapshot.macros?.macros).toEqual(source.macros?.macros);
        expect(transferredChannel).toEqual({
            ...Object.values(source.automation?.channels ?? {})[0],
            id: transferredChannel.id,
        });
        expect(snapshot.fontAssets).toBeUndefined();
        expect(snapshot).not.toHaveProperty('interaction');
        expect(snapshot).not.toHaveProperty('runtimeMeta');
    });

    it('restores all persistent slices when a transactional graph command fails', () => {
        seedPersistentScene();
        const store = useSceneStore.getState();
        const nodeId = store.nodeIdByElementId['snapshot-contract'];
        store.setAutomationChannel({
            id: 'snapshot-contract-node-channel',
            target: { owner: { kind: 'node', id: nodeId }, propertyPath: 'translationX' },
            valueType: 'number',
            keyframes: [createKeyframe(0, 1)],
        });
        const expected = createSceneSnapshot(useSceneStore.getState());

        const result = dispatchSceneCommand({
            type: 'reparentNodes',
            nodeIds: [nodeId],
            newParentId: useSceneStore.getState().graph.rootId,
            targetIndex: 0,
        });

        expect(result.success).toBe(false);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(expected);
    });
});
