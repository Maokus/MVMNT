import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';
import { resetMacroStoreBinding, setMacroStoreBinding } from '@state/scene/macroSyncService';
import { SceneRuntimeAdapter } from '@state/scene/runtimeAdapter';
import { deriveElementOrder, groupSceneNodes } from '@state/scene-graph';

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
        expect(runtimeIds).toEqual(deriveElementOrder(store.getState().graph));
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

    it('notifies the visualizer when a live element binding changes', () => {
        const listener = vi.fn();
        window.addEventListener('mvmnt-scene-runtime-updated', listener);

        store.getState().updateBindings('title', { visible: { type: 'constant', value: false } });

        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('mvmnt-scene-runtime-updated', listener);
    });

    it('rebuilds a resolved frame after an external resource update', () => {
        const config = { canvas: { width: 1920, height: 1080 } };
        const first = adapter.resolveFrame(config, 0);

        expect(adapter.resolveFrame(config, 0)).toBe(first);

        adapter.invalidateResolvedFrame();

        expect(adapter.resolveFrame(config, 0)).not.toBe(first);
    });

    it('retains unrelated plugin instances when hierarchy changes', () => {
        const before = new Map(adapter.getElements().map((element) => [element.id, element]));
        const scene = store.getState();
        const titleNode = scene.nodeIdByElementId.title;
        let graph = groupSceneNodes(scene.graph, [titleNode], 'group:inner');
        graph = groupSceneNodes(graph, ['group:inner'], 'group:outer');
        store.getState().replaceGraph(graph);
        const after = new Map(adapter.getElements().map((element) => [element.id, element]));
        expect(after.get('title')).toBe(before.get('title'));
        expect(after.get('background')).toBe(before.get('background'));
    });

    it('updates graph order without rewriting element bindings', () => {
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
        expect(versionsAfter.background).toBe(versionsBefore.background);
        expect(adapter.getElements().map((element) => element.id)).toEqual(deriveElementOrder(store.getState().graph));
        expect(afterOrder.version).toBeGreaterThan(beforeOrder.version);
        const bindings = store.getState().bindings.byElement;
        expect(bindings.background.zIndex).toBeUndefined();
        expect(bindings.title.zIndex).toBeUndefined();
    });

    it('hydrates audio feature track bindings for new elements', () => {
        store.getState().addElement({
            id: 'osc',
            type: 'audioWaveform',
            index: deriveElementOrder(store.getState().graph).length,
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
            index: deriveElementOrder(store.getState().graph).length,
            bindings: {
                imageSource: { type: 'constant', value: 'custom-gif-id' },
            },
        });

        store.getState().updateBindings('image', { imageSource: null });

        const image = adapter.getElements().find((element) => element.id === 'image');
        expect(image?.getBinding('imageSource')?.getValue()).toBeUndefined();
    });
});
