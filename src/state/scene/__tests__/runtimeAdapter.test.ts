import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';
import { resetMacroStoreBinding, setMacroStoreBinding } from '@state/scene/macroSyncService';
import { SceneRuntimeAdapter } from '@state/scene/runtimeAdapter';
import { deriveElementOrder, groupSceneNodes } from '@state/scene-graph';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { SceneElementRegistry, type SceneElementRegistration } from '@core/scene/registry';
import { BoundSceneElement } from '@core/scene/runtime/bound-scene-element';
import { Rectangle, Text } from '@core/render/render-objects';

class PluginRuntimeElement extends BoundSceneElement {
    static override getConfigSchema() {
        return {
            ...super.getConfigSchema(),
            name: 'Plugin element',
            description: 'Plugin element used by runtime adapter tests',
            category: 'Tests',
        };
    }

    protected override _buildRenderObjects() {
        return [new Rectangle(0, 0, 10, 10)];
    }
}

function pluginRegistration(type: string, pluginId: string): SceneElementRegistration {
    return {
        type,
        origin: { kind: 'plugin', pluginId },
        schema: PluginRuntimeElement.getConfigSchema(),
        create: (config = {}) => new PluginRuntimeElement(type, String(config.id ?? type), config),
    };
}

function renderedText(objects: any[]): Text[] {
    return objects.flatMap((object) => [
        ...(object instanceof Text ? [object] : []),
        ...renderedText(object.children ?? []),
    ]);
}

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

    it('notifies the visualizer when a transient transform preview changes', () => {
        const listener = vi.fn();
        const nodeId = store.getState().nodeIdByElementId.title;
        window.addEventListener('mvmnt-scene-runtime-updated', listener);

        useSceneEditorStore.getState().setTransientNodeTransform(nodeId, { translationX: 42 });

        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('mvmnt-scene-runtime-updated', listener);
        useSceneEditorStore.getState().clearTransientNodeTransforms();
    });

    it('rebuilds a resolved frame after an external resource update', () => {
        const config = { canvas: { width: 1920, height: 1080 } };
        const first = adapter.resolveFrame(config, 0);

        expect(adapter.resolveFrame(config, 0)).toBe(first);

        adapter.invalidateResolvedFrame();

        expect(adapter.resolveFrame(config, 0)).not.toBe(first);
    });

    it('rebuilds text geometry when a font finishes loading', () => {
        const config = { canvas: { width: 1920, height: 1080 } };
        const first = adapter.resolveFrame(config, 0);
        const beforeVersion = adapter.getVersion();
        const listener = vi.fn();
        window.addEventListener('mvmnt-scene-runtime-updated', listener);

        window.dispatchEvent(new CustomEvent('font-loaded', { detail: { family: 'Meddon', weights: [400] } }));

        expect(adapter.getVersion()).toBeGreaterThan(beforeVersion);
        expect(adapter.resolveFrame(config, 0)).not.toBe(first);
        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('mvmnt-scene-runtime-updated', listener);
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

    it('replaces an unregistered plugin element with an isolated missing-plugin placeholder', () => {
        adapter.dispose();
        const pluginId = 'com.example.visuals';
        const type = `${pluginId}:colliding-properties`;
        const registry = new SceneElementRegistry([pluginRegistration(type, pluginId)]);
        store = createSceneStore();
        setMacroStoreBinding(store);
        store.getState().addElement({
            id: 'plugin-element',
            type,
            index: 0,
            bindings: {
                width: { type: 'constant', value: 0 },
                height: { type: 'constant', value: 0 },
                label: { type: 'constant', value: 'Plugin-owned label' },
                contentAnchorX: { type: 'constant', value: Number.NaN },
            },
        });
        adapter = new SceneRuntimeAdapter({ store, registry });
        expect(adapter.getElements()[0]).toMatchObject({ type, id: 'plugin-element' });

        const unregisteredTypes = registry.unregisterPlugin(pluginId);
        window.dispatchEvent(
            new CustomEvent('mvmnt-plugin-availability-changed', {
                detail: { action: 'removed', pluginId, unregisteredTypes },
            })
        );

        const fallback = adapter.getElements()[0];
        expect(fallback).toMatchObject({ type: 'missingPlugin', id: 'plugin-element' });
        expect(fallback.visible).toBe(true);
        expect(
            renderedText(fallback.buildRenderObjects({ canvas: { width: 1920, height: 1080 } }, 0))
        ).not.toHaveLength(0);
        const output = adapter.buildScene({ canvas: { width: 1920, height: 1080 } }, 0);
        const text = renderedText(output).map((item) => item.text);
        expect(text).toContain('Missing plugin');
        expect(text).toContain(`Plugin: ${pluginId} | Type: ${type}`);
        expect(text).not.toContain('Plugin-owned label');
        const directOutput = fallback.buildRenderObjects({ canvas: { width: 1920, height: 1080 } }, 0) as any[];
        expect(directOutput[0].children[0]).toMatchObject({ width: 260, height: 140 });
    });

    it('creates the same placeholder when a scene opens after its plugin was removed', () => {
        adapter.dispose();
        store = createSceneStore();
        setMacroStoreBinding(store);
        store.getState().addElement({
            id: 'orphaned-element',
            type: 'com.example.removed:particles',
            index: 0,
            bindings: { width: { type: 'constant', value: 0 } },
        });
        adapter = new SceneRuntimeAdapter({ store, registry: new SceneElementRegistry() });

        expect(adapter.getElements()[0].visible).toBe(true);
        expect(renderedText(adapter.getElements()[0].buildRenderObjects({}, 0))).not.toHaveLength(0);
        const output = adapter.buildScene({ canvas: { width: 1920, height: 1080 } }, 0);
        expect(renderedText(output).map((item) => item.text)).toEqual([
            'Missing plugin',
            'Plugin: com.example.removed | Type: com.example.removed:particles',
        ]);
    });
});
