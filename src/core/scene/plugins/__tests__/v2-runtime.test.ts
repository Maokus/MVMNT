import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginHostServices, PLUGIN_CAPABILITIES } from '../host-api/plugin-api';
import { createPluginDefinitionScope } from '../v2-runtime';
import { definePluginElement, type CapabilityContext } from '../../../../../packages/plugin-sdk/src/scene';
import { getElementSubscriptionSnapshot } from '@audio/features/sceneApi';
import { renderResourceManager } from '@core/render/render-resource-manager';

afterEach(() => {
    document.querySelectorAll('link[id^="gf-"]').forEach((link) => link.remove());
    renderResourceManager.clear();
    vi.unstubAllGlobals();
});

function installHost() {
    const state = {
        timeline: { id: 'timeline', name: 'Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
        tracks: {},
        tracksOrder: [],
        audioCache: {},
        timelineView: { startTick: 0, endTick: 1920 },
    } as any;
    const host = createPluginHostServices({
        timelineStore: { getState: () => state },
        selectNotesInWindow: () => [],
        selectTrackById: () => undefined,
        selectTracksByIds: () => [],
        selectMidiTracks: () => [],
        getFeatureData: () => null,
        getFeatureDataRange: () => [],
    }).services;
    return host;
}

describe('SDK v2 runtime', () => {
    it('exposes namespaced generated rasters as opaque visual snapshots', async () => {
        class MockCanvas {
            readonly context = { putImageData: vi.fn() };
            constructor(
                readonly width: number,
                readonly height: number
            ) {}
            getContext() {
                return this.context;
            }
        }
        vi.stubGlobal('OffscreenCanvas', MockCanvas);
        vi.stubGlobal(
            'ImageData',
            class {
                constructor(
                    readonly data: Uint8ClampedArray,
                    readonly width: number,
                    readonly height: number
                ) {}
            }
        );
        const build = vi.fn(() => new Uint8ClampedArray(16).fill(12));
        let context!: CapabilityContext;
        const definition = definePluginElement({
            type: 'raster-test',
            metadata: { name: 'Raster test' },
            schema: { tabs: [] },
            capabilities: { required: [], optional: [] },
            load(value) {
                context = value;
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'com.example.raster',
            services: installHost(),
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });

        const request = {
            contentKey: 'input-revision:1',
            width: 2,
            height: 2,
            format: 'rgba8' as const,
            build,
        };
        const cold = context.assets.generatedRaster(request);
        const warm = context.assets.generatedRaster(request);

        expect(cold).toMatchObject({ ok: true, value: { status: 'ready' } });
        expect(warm).toMatchObject({ ok: true, value: { status: 'ready' } });
        expect(build).toHaveBeenCalledTimes(1);
        if (cold.ok && warm.ok) expect(warm.value.resource).toBe(cold.value.resource);
        await scope.dispose();
    });

    it('keeps feature requirements attached after an external plugin element receives its qualified type', async () => {
        const host = installHost();
        const definition = definePluginElement({
            type: 'feature-display',
            metadata: { name: 'Feature display' },
            schema: {
                tabs: [
                    {
                        id: 'content',
                        label: 'Content',
                        groups: [
                            {
                                id: 'audio',
                                label: 'Audio',
                                properties: [
                                    {
                                        key: 'audioTrackId',
                                        label: 'Audio track',
                                        type: 'timelineTrackRef',
                                        default: null,
                                        allowedTrackTypes: ['audio'],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead], optional: [] },
            load(context) {
                context.audio!.requireFeatures([
                    { feature: 'plugin.transients', calculatorId: 'test.plugin.transients' },
                ]);
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test.plugin',
            runtimeElementType: 'test.plugin:feature-display',
            services: host,
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const ElementClass = scope.createElementClass();
        const instance = new ElementClass('feature-display', {});

        expect(instance.type).toBe('test.plugin:feature-display');
        expect(getElementSubscriptionSnapshot(instance)).toEqual([]);

        instance.setProperty('audioTrackId', 'audio-track');

        expect(getElementSubscriptionSnapshot(instance)).toEqual([
            {
                trackId: 'audio-track',
                descriptor: expect.objectContaining({
                    featureKey: 'plugin.transients',
                    calculatorId: 'test.plugin.transients',
                }),
            },
        ]);

        instance.dispose();
        await scope.dispose();
    });

    it('loads schema-declared fonts before the appearance inspector is opened', async () => {
        const host = installHost();
        const definition = definePluginElement({
            type: 'font-load-test',
            metadata: { name: 'Font load test' },
            schema: {
                tabs: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        groups: [
                            {
                                id: 'typography',
                                label: 'Typography',
                                properties: [
                                    { key: 'fontFamily', label: 'Font', type: 'font', default: 'SDK Runtime Font|600' },
                                ],
                            },
                        ],
                    },
                ],
            },
            capabilities: { required: [], optional: [] },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const ElementClass = scope.createElementClass();
        const instance = new ElementClass('font-test', {});

        const link = document.getElementById('gf-SDK+Runtime+Font') as HTMLLinkElement | null;
        expect(link?.href).toContain('family=SDK+Runtime+Font:wght@600');

        instance.dispose();
        await scope.dispose();
        link?.remove();
    });

    it('keeps undeclared operations away from internal services', async () => {
        const host = installHost();
        const rawSpy = vi.spyOn(host.audio, 'getRawSamples');
        let context!: CapabilityContext;
        const definition = definePluginElement({
            type: 'capability-test',
            metadata: { name: 'Capability test' },
            schema: { tabs: [] },
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead], optional: [] },
            load(value) {
                context = value;
            },
            render() {
                return [];
            },
        });
        // The callback runtime receives private host services directly.
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        expect(await scope.ready).toBe(true);

        const result = context.audio!.getRawSamples({ trackId: 'audio', startSeconds: 0, endSeconds: 1 });
        expect(result).toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
        expect(rawSpy).not.toHaveBeenCalled();
        await scope.dispose();
    });

    it('waits for asynchronous initialization and cancels on disposal', async () => {
        const host = installHost();
        let finishCreate!: () => void;
        const render = vi.fn(() => []);
        const definition = definePluginElement({
            type: 'async-test',
            metadata: { name: 'Async test' },
            schema: { tabs: [] },
            capabilities: { required: [], optional: [] },
            create: () =>
                new Promise<void>((resolve) => {
                    finishCreate = resolve;
                }),
            render,
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        await scope.ready;
        const ElementClass = scope.createElementClass();
        const instance = new ElementClass('async', {});
        instance.buildRenderObjects({}, 0);
        expect(render).not.toHaveBeenCalled();
        await Promise.resolve();
        finishCreate();
        await Promise.resolve();
        await Promise.resolve();
        instance.buildRenderObjects({}, 0);
        expect(render).toHaveBeenCalledTimes(1);
        instance.dispose();
        await scope.dispose();
    });

    it('cleans scoped calculator registrations on unload', async () => {
        const host = installHost();
        const calculator = {
            id: 'test.scoped',
            version: 1,
            featureKey: 'scoped',
            calculate: () => ({ frameCount: 0, channels: 1, format: 'float32' as const, data: new Float32Array() }),
        };
        const definition = definePluginElement({
            type: 'cleanup-test',
            metadata: { name: 'Cleanup test' },
            schema: { tabs: [] },
            capabilities: { required: [PLUGIN_CAPABILITIES.audioCalculatorsRegister], optional: [] },
            load(context) {
                context.audioCalculators!.register(calculator);
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        await scope.ready;
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(true);
        await scope.dispose();
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(false);
    });
});
