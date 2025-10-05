import { describe, it, expect, beforeEach } from 'vitest';
import { exportScene, importScene } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene';

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
            expect(res.envelope.scene.elements.length).toBe(1);
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
        expect(exported.elements.length).toBe(1);
        expect(useSceneStore.getState().macros.byId['m1']?.value).toBe(5);
    });
});
