import { describe, it, expect, beforeEach } from 'vitest';
import { exportScene, importScene } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene';
import { createKeyframe, elementPropertyTarget } from '@automation/types';

describe('Scene element + macro persistence', () => {
    beforeEach(() => {
        useTimelineStore.setState((s: any) => ({ ...s, tracks: {}, tracksOrder: [], midiCache: {} }));
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'm1',
            definition: { type: 'number', value: 5 },
        });
    });

    it('exports elements and macros', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'el1',
            config: { id: 'el1', text: { type: 'constant', value: 'Hello' }, zIndex: { type: 'constant', value: 1 } },
        });
        const res = await exportScene();
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.mode).toBe('zip-package');
            expect(Object.keys(res.envelope.scene.elements).length).toBe(1);
            expect(res.envelope.scene.macros?.macros?.m1?.value).toBe(5);
        }
    });

    it('imports elements and macros', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'el1',
            config: { id: 'el1', text: { type: 'constant', value: 'Hello' }, zIndex: { type: 'constant', value: 1 } },
        });
        const exp = await exportScene();
        expect(exp.ok).toBe(true);
        if (!exp.ok || exp.mode !== 'zip-package') {
            throw new Error('Expected packaged export for import test');
        }

        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        const imp = await importScene(exp.zip);
        expect(imp.ok).toBe(true);
        const exported = useSceneStore.getState().exportSceneDraft();
        expect(Object.keys(exported.elements).length).toBe(1);
        expect(useSceneStore.getState().macros.byId['m1']?.value).toBe(5);
    });

    it('round-trips perspective bindings with out-of-bounds anchors and pivots', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'warped',
            config: {
                id: 'warped',
                text: 'Warped',
                warpEnabled: true,
                perspectiveRotationX: -20,
                perspectiveRotationY: 15,
                perspectiveStrength: 65,
                contentAnchorX: -0.5,
                contentAnchorY: 1.5,
                perspectivePivotLinked: false,
                perspectivePivotX: -0.25,
                perspectivePivotY: 1.25,
                perspectiveVanishingPointX: 0.4,
                perspectiveVanishingPointY: 0.6,
            },
        });
        const exported = await exportScene();
        expect(exported.ok).toBe(true);
        if (!exported.ok || exported.mode !== 'zip-package') throw new Error('Expected packaged export');
        useSceneStore.getState().clearScene();
        const imported = await importScene(exported.zip);
        expect(imported.ok).toBe(true);
        const bindings = useSceneStore.getState().bindings.byElement.warped;
        expect(bindings.warpEnabled).toEqual({ type: 'constant', value: true });
        expect(bindings.perspectiveRotationX).toEqual({ type: 'constant', value: -20 });
        expect(bindings.perspectiveRotationY).toEqual({ type: 'constant', value: 15 });
        expect(bindings.perspectiveStrength).toEqual({ type: 'constant', value: 65 });
        expect(bindings.contentAnchorX).toEqual({ type: 'constant', value: -0.5 });
        expect(bindings.contentAnchorY).toEqual({ type: 'constant', value: 1.5 });
        expect(bindings.perspectivePivotLinked).toEqual({ type: 'constant', value: false });
        expect(bindings.perspectivePivotX).toEqual({ type: 'constant', value: -0.25 });
        expect(bindings.perspectivePivotY).toEqual({ type: 'constant', value: 1.25 });
        expect(bindings.perspectiveVanishingPointX).toEqual({ type: 'constant', value: 0.4 });
        expect(bindings.perspectiveVanishingPointY).toEqual({ type: 'constant', value: 0.6 });
    });

    it('exports scenes with multiple automation keyframes', async () => {
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'el1',
            config: {
                id: 'el1',
                text: { type: 'constant', value: 'Hello' },
                offsetX: { type: 'constant', value: 0 },
                zIndex: { type: 'constant', value: 1 },
            },
        });

        dispatchSceneCommand({
            type: 'enablePropertyAutomation',
            target: elementPropertyTarget('el1', 'offsetX'),
            valueType: 'number',
            initialKeyframes: [createKeyframe(0, 0)],
        });
        const channelId = useSceneStore.getState().bindings.byElement.el1.offsetX;
        dispatchSceneCommand({
            type: 'addKeyframe',
            channelId: channelId.type === 'keyframes' ? channelId.channelId : '',
            keyframe: createKeyframe(120, 100),
        });

        const res = await exportScene();
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error('Expected packaged export for automation regression test');

        const channel = Object.values(res.envelope.scene.automation?.channels ?? {}).find(
            (entry: any) => entry.target.owner.id === 'el1' && entry.target.propertyPath === 'offsetX'
        ) as any;
        expect(channel?.keyframes).toHaveLength(2);
    });
});
