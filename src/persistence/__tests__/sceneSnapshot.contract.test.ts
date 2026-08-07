import { beforeEach, describe, expect, it } from 'vitest';
import { createKeyframe, elementPropertyTarget } from '@automation/types';
import { DocumentGateway } from '@persistence/document-gateway';
import { dispatchSceneCommand } from '@state/scene';
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
}

describe('canonical scene snapshot contract', () => {
    beforeEach(() => useSceneStore.getState().clearScene());

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
});
