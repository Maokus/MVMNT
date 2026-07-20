import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';
import { resetMacroStoreBinding, setMacroStoreBinding } from '@state/scene/macroSyncService';
import { SceneRuntimeAdapter } from '@state/scene/runtimeAdapter';

describe('SceneRuntimeAdapter', () => {
    let store: ReturnType<typeof createSceneStore>;
    let adapter: SceneRuntimeAdapter;

    beforeEach(() => {
        store = createSceneStore();
        setMacroStoreBinding(store);
        store.getState().importScene(fixture as any);
        adapter = new SceneRuntimeAdapter({ store });
    });

    afterEach(() => {
        adapter.dispose();
        resetMacroStoreBinding();
    });

    it('initializes runtime elements respecting store order', () => {
        const runtimeIds = adapter.getElements().map((element) => element.id);
        expect(runtimeIds).toEqual(store.getState().order);
    });

    it('gives older scene elements identity warp defaults without a migration', () => {
        const element = adapter.getElements()[0];
        expect(element.getBinding('warpEnabled')?.getValue()).toBe(false);
        expect(element.perspectiveWarp).toEqual({
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 },
            bottomLeft: { x: 0, y: 1 },
        });
    });

    it('bumps cache version only for elements with binding changes', () => {
        const beforeDiagnostics = adapter.collectDiagnostics();
        const originalTitleVersion = adapter.getElementVersion('title');
        const originalBackgroundVersion = adapter.getElementVersion('background');

        store.getState().updateBindings('title', { visible: { type: 'constant', value: false } });

        const afterDiagnostics = adapter.collectDiagnostics();
        expect(adapter.getElementVersion('title')).toBeGreaterThan(originalTitleVersion);
        expect(adapter.getElementVersion('background')).toBe(originalBackgroundVersion);
        expect(afterDiagnostics.version).toBeGreaterThan(beforeDiagnostics.version);
    });

    it('updates z-index bindings and cache versions when order changes', () => {
        const beforeOrder = adapter.collectDiagnostics();
        const versionsBefore = {
            title: adapter.getElementVersion('title'),
            background: adapter.getElementVersion('background'),
        };

        store.getState().moveElement('background', 0);

        const versionsAfter = {
            title: adapter.getElementVersion('title'),
            background: adapter.getElementVersion('background'),
        };
        const afterOrder = adapter.collectDiagnostics();

        expect(versionsAfter.title).toBe(versionsBefore.title);
        expect(versionsAfter.background).toBeGreaterThan(versionsBefore.background);
        expect(adapter.getElements().map((element) => element.id)).toEqual(store.getState().order);
        expect(afterOrder.version).toBeGreaterThan(beforeOrder.version);
        const bindings = store.getState().bindings.byElement;
        expect(bindings.background.zIndex).toEqual({ type: 'constant', value: 1 });
        expect(bindings.title.zIndex).toEqual({ type: 'constant', value: 0 });
    });

    it('hydrates audio feature track bindings for new elements', () => {
        store.getState().addElement({
            id: 'osc',
            type: 'audioWaveform',
            index: store.getState().order.length,
            bindings: {
                audioTrackId: { type: 'constant', value: 'track-1' },
                features: {
                    type: 'constant',
                    value: [
                        {
                            featureKey: 'waveform',
                            calculatorId: 'mvmnt.waveform',
                            bandIndex: null,
                            smoothing: 0.1,
                        },
                    ],
                },
                analysisProfileId: { type: 'constant', value: 'default' },
            },
        });

        const runtimeElement = adapter.getElements().find((element) => element.id === 'osc');
        expect(runtimeElement).toBeDefined();
        const trackBinding = runtimeElement?.getBinding('audioTrackId');
        const descriptorBinding = runtimeElement?.getBinding('features');
        expect(trackBinding?.getValue()).toBe('track-1');
        expect(descriptorBinding?.getValue()).toEqual([expect.objectContaining({ featureKey: 'waveform' })]);
    });

    it('resets removed optional bindings on an existing runtime element', () => {
        store.getState().addElement({
            id: 'image',
            type: 'image',
            index: store.getState().order.length,
            bindings: {
                imageSource: { type: 'constant', value: 'custom-gif-id' },
            },
        });

        store.getState().updateBindings('image', { imageSource: null });

        const image = adapter.getElements().find((element) => element.id === 'image');
        expect(image?.getBinding('imageSource')?.getValue()).toBeUndefined();
    });
});
