import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginHostServices, PLUGIN_CAPABILITIES } from '../host-api/plugin-api';
import { createPluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { definePluginElement, type CapabilityContext } from '../../../../../packages/plugin-sdk/src/scene';
import { getAnalysisIntentSnapshot, resetAnalysisIntentStateForTests } from '@audio/features/analysisIntents';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { renderResourceManager } from '@core/render/render-resource-manager';
import type { ElementContext } from '../../../../../packages/plugin-sdk/src/scene';
import { KeyframeBinding } from '@bindings/keyframe-binding';

afterEach(() => {
    document.querySelectorAll('link[id^="gf-"]').forEach((link) => link.remove());
    renderResourceManager.clear();
    resetAnalysisIntentStateForTests();
    vi.unstubAllGlobals();
});

function installHost(getFeatureData: (...args: any[]) => any = () => null) {
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
        getFeatureData,
        getFeatureDataRange: () => [],
    }).services;
    return host;
}

describe('SDK v2 runtime', () => {
    it('retains distinct instance state across arbitrary renders and disposes it once', async () => {
        const createdStates: Array<{ readonly id: string }> = [];
        const renderedStates: Array<{ readonly id: string }> = [];
        const disposedStates: Array<{ readonly id: string }> = [];
        const definition = definePluginElement({
            type: 'instance-state-lifecycle-test',
            metadata: { name: 'Instance state lifecycle test' },
            schema: {
                tabs: [
                    {
                        id: 'properties',
                        label: 'Properties',
                        groups: [
                            {
                                id: 'values',
                                label: 'Values',
                                properties: [{ key: 'value', type: 'number', label: 'Value', default: 1 }],
                            },
                        ],
                    },
                ],
            },
            createResources(context) {
                const resources = { id: context.signal.aborted ? 'aborted' : `state-${createdStates.length}` };
                createdStates.push(resources);
                return resources;
            },
            render({ resources }) {
                renderedStates.push(resources);
                return [];
            },
            disposeResources(resources) {
                disposedStates.push(resources);
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: installHost(),
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const registration = scope.createRegistration({ kind: 'built-in' });
        const first = registration.create({ id: 'first', value: 1 });
        const second = registration.create({ id: 'second', value: 2 });

        first.buildRenderObjects({}, 5);
        first.buildRenderObjects({}, 1);
        first.updateConfig({ value: 3 });
        first.buildRenderObjects({}, 5);
        second.buildRenderObjects({}, 2);

        expect(createdStates).toHaveLength(2);
        expect(createdStates[0]).not.toBe(createdStates[1]);
        expect(renderedStates).toEqual([createdStates[0], createdStates[0], createdStates[0], createdStates[1]]);

        first.dispose();
        first.dispose();
        second.dispose();
        expect(disposedStates).toEqual([createdStates[0], createdStates[1]]);
        await scope.dispose();
    });

    it('provides instance-scoped arbitrary-time property sampling and integration', async () => {
        type Props = Readonly<{ speed: number; label: string }>;
        const contexts: ElementContext<Props>[] = [];
        const renderedSpeeds: number[] = [];
        const definition = definePluginElement<Props>({
            type: 'property-sampling-test',
            metadata: { name: 'Property sampling test' },
            schema: {
                tabs: [
                    {
                        id: 'properties',
                        label: 'Properties',
                        groups: [
                            {
                                id: 'values',
                                label: 'Values',
                                properties: [
                                    { key: 'speed', type: 'number', label: 'Speed', default: 2 },
                                    { key: 'label', type: 'string', label: 'Label', default: 'first' },
                                ],
                            },
                        ],
                    },
                ],
            },
            render({ props, context }) {
                if (!contexts.includes(context)) contexts.push(context);
                renderedSpeeds.push(props.speed);
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: installHost(),
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const registration = scope.createRegistration({ kind: 'built-in' });
        const first = registration.create({ id: 'first', speed: 4, label: 'one' });
        const second = registration.create({ id: 'second', speed: 10, label: 'two' });

        first.buildRenderObjects({}, 5);
        second.buildRenderObjects({}, 5);
        expect(contexts[0].properties.valueAt('speed', -2)).toEqual({ ok: true, value: 4 });
        expect(contexts[0].properties.integrate('speed', { startSeconds: -1, endSeconds: 2 })).toEqual({
            ok: true,
            value: 12,
        });
        expect(contexts[0].properties.average('speed', { startSeconds: 0, endSeconds: 2 })).toEqual({
            ok: true,
            value: 4,
        });
        expect(contexts[1].properties.valueAt('speed', 1)).toEqual({ ok: true, value: 10 });
        expect(renderedSpeeds).toEqual([4, 10]);

        expect(contexts[0].properties.valueAt('missing' as keyof Props, 0)).toMatchObject({
            ok: false,
            error: { code: 'INVALID_ARGUMENT' },
        });
        expect(contexts[0].properties.integrate('speed', { startSeconds: 2, endSeconds: 1 })).toMatchObject({
            ok: false,
            error: { code: 'INVALID_ARGUMENT' },
        });
        expect(contexts[0].properties.average('speed', { startSeconds: 1, endSeconds: 1 })).toMatchObject({
            ok: false,
            error: { code: 'INVALID_ARGUMENT' },
        });
        expect((contexts[0].properties as any).integrate('label', { startSeconds: 0, endSeconds: 1 })).toMatchObject({
            ok: false,
            error: { code: 'INVALID_ARGUMENT' },
        });

        first.dispose();
        second.dispose();
        expect(contexts[0].properties.valueAt('speed', 0)).toMatchObject({
            ok: false,
            error: { code: 'ABORTED' },
        });
        await scope.dispose();
    });

    it('samples keyframe-bound properties without changing the current render value', async () => {
        type Props = Readonly<{ speed: number }>;
        const bindingRead = vi
            .spyOn(KeyframeBinding.prototype, 'getValueWithContext')
            .mockImplementation((context) => context.targetTime * 10);
        let context!: ElementContext<Props>;
        const rendered: number[] = [];
        const definition = definePluginElement<Props>({
            type: 'keyframe-property-sampling-test',
            metadata: { name: 'Keyframe property sampling test' },
            schema: {
                tabs: [
                    {
                        id: 'properties',
                        label: 'Properties',
                        groups: [
                            {
                                id: 'values',
                                label: 'Values',
                                properties: [{ key: 'speed', type: 'number', label: 'Speed', default: 0 }],
                            },
                        ],
                    },
                ],
            },
            render({ props, context: value }) {
                context = value;
                rendered.push(props.speed);
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: installHost(),
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const instance = scope.createRegistration({ kind: 'built-in' }).create({
            id: 'keyframed',
            speed: { type: 'keyframes', channelId: 'channel:speed' },
        });

        instance.buildRenderObjects({}, 2);
        expect(rendered).toEqual([20]);
        expect(context.properties.valueAt('speed', 0.25)).toEqual({ ok: true, value: 2.5 });
        expect(context.properties.integrate('speed', { startSeconds: 0, endSeconds: 1 })).toEqual({
            ok: true,
            value: 5,
        });
        instance.buildRenderObjects({}, 2);
        expect(rendered).toEqual([20, 20]);
        expect(bindingRead).toHaveBeenCalledWith(expect.objectContaining({ targetTime: 0.25 }));

        instance.dispose();
        await scope.dispose();
        bindingRead.mockRestore();
    });

    it('forwards feature smoothing to the host sampling options', async () => {
        const getFeatureData = vi.fn(() => null);
        const host = installHost(getFeatureData);
        let context!: CapabilityContext;
        const definition = definePluginElement({
            type: 'smoothing-test',
            metadata: { name: 'Smoothing test' },
            schema: { tabs: [] },
            render({ context: value }) {
                context = value;
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead] },
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });

        scope.createRegistration({ kind: 'built-in' }).create().buildRenderObjects({}, 1);
        expect('properties' in context).toBe(true);
        context.audio!.sampleFeature({ trackId: 'audio-track', feature: 'spectrogram', timeSeconds: 1, smoothing: 12 });

        expect(getFeatureData).toHaveBeenCalledWith(expect.any(Object), 'audio-track', 'spectrogram', 1, {
            smoothing: 12,
        });
        await scope.dispose();
    });

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
            audioFeatureDemands(props) {
                return [
                    {
                        id: 'transients',
                        trackId: typeof props.audioTrackId === 'string' ? props.audioTrackId : null,
                        feature: 'plugin.transients',
                        calculatorId: 'test.plugin.transients',
                    },
                ];
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test.plugin',
            runtimeElementType: 'test.plugin:feature-display',
            services: host,
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead] },
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const instance = scope
            .createRegistration({ kind: 'plugin', pluginId: 'test.plugin' })
            .create({ id: 'feature-display' });

        expect(instance.type).toBe('test.plugin:feature-display');
        expect(getAnalysisIntentSnapshot()).toEqual([]);

        instance.updateConfig({ audioTrackId: 'audio-track' });

        expect(getAnalysisIntentSnapshot()).toEqual([
            expect.objectContaining({
                ownerElementId: 'feature-display',
                requestId: 'transients',
                trackRef: 'audio-track',
                descriptors: [
                    expect.objectContaining({
                        descriptor: expect.objectContaining({
                            featureKey: 'plugin.transients',
                            calculatorId: 'test.plugin.transients',
                        }),
                    }),
                ],
            }),
        ]);

        instance.dispose();
        await scope.dispose();
    });

    it('keeps custom profile demands isolated per element instance', async () => {
        const host = installHost();
        const definition = definePluginElement({
            type: 'profile-display',
            metadata: { name: 'Profile display' },
            schema: {
                tabs: [
                    {
                        id: 'audio',
                        label: 'Audio',
                        groups: [
                            {
                                id: 'analysis',
                                label: 'Analysis',
                                properties: [
                                    {
                                        key: 'audioTrackId',
                                        label: 'Audio track',
                                        type: 'timelineTrackRef',
                                        default: null,
                                    },
                                    { key: 'windowSize', label: 'Window', type: 'number', default: 2048 },
                                ],
                            },
                        ],
                    },
                ],
            },
            audioFeatureDemands(props) {
                return [
                    {
                        id: 'spectrogram',
                        trackId: props.audioTrackId,
                        feature: 'spectrogram',
                        profileParams: { windowSize: props.windowSize },
                    },
                ];
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test.plugin',
            services: host,
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead] },
            synchronousInitialization: true,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        const registration = scope.createRegistration({ kind: 'plugin', pluginId: 'test.plugin' });
        const first = registration.create({ id: 'first', audioTrackId: 'audio-a', windowSize: 4096 });
        const second = registration.create({ id: 'second', audioTrackId: 'audio-b', windowSize: 8192 });

        const snapshot = getAnalysisIntentSnapshot();
        expect(snapshot).toHaveLength(2);
        expect(snapshot.map((intent) => intent.ownerElementId).sort()).toEqual(['first', 'second']);
        expect(snapshot.map((intent) => intent.descriptors[0]?.descriptor.profileOverrides?.windowSize).sort()).toEqual(
            [4096, 8192]
        );

        first.dispose();
        expect(getAnalysisIntentSnapshot().map((intent) => intent.ownerElementId)).toEqual(['second']);
        second.dispose();
        await scope.dispose();
    });

    it('loads schema-declared fonts before the appearance inspector is opened', async () => {
        const load = vi.fn().mockResolvedValue([]);
        Object.defineProperty(document, 'fonts', {
            value: { load, check: vi.fn().mockReturnValue(true) },
            configurable: true,
        });
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
                                    { key: 'fontFamily', label: 'Font', type: 'font', default: 'BuiltIn:inter|600' },
                                ],
                            },
                        ],
                    },
                ],
            },
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
        const instance = scope.createRegistration({ kind: 'built-in' }).create({ id: 'font-test' });

        await vi.waitFor(() => expect(load).toHaveBeenCalledWith("600 32px 'Inter'"));
        expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();

        instance.dispose();
        await scope.dispose();
    });

    it('keeps undeclared operations away from internal services', async () => {
        const host = installHost();
        const rawSpy = vi.spyOn(host.audio, 'getRawSamples');
        let context!: CapabilityContext;
        const definition = definePluginElement({
            type: 'capability-test',
            metadata: { name: 'Capability test' },
            schema: { tabs: [] },
            render({ context: value }) {
                context = value;
                return [];
            },
        });
        // The callback runtime receives private host services directly.
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead] },
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        expect(await scope.ready).toBe(true);

        const instance = scope.createRegistration({ kind: 'built-in' }).create();
        await vi.waitFor(() => {
            instance.buildRenderObjects({}, 0);
            expect(context).toBeDefined();
        });

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
            createResources: () =>
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
        const instance = scope.createRegistration({ kind: 'built-in' }).create({ id: 'async' });
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

    it('disposes instance state that finishes creating after cancellation', async () => {
        const host = installHost();
        const resources = { resource: 'late' };
        let finishCreate!: (value: typeof resources) => void;
        let context!: import('../../../../../packages/plugin-sdk/src/scene').ResourceContext;
        const dispose = vi.fn();
        const definition = definePluginElement<Readonly<Record<string, never>>, typeof resources>({
            type: 'cancelled-create-test',
            metadata: { name: 'Cancelled create test' },
            schema: { tabs: [] },
            createResources(value) {
                context = value;
                return new Promise((resolve) => {
                    finishCreate = resolve;
                });
            },
            render() {
                return [];
            },
            disposeResources: dispose,
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        await scope.ready;
        const instance = scope.createRegistration({ kind: 'plugin', pluginId: 'test' }).create({ id: 'cancelled' });
        await Promise.resolve();

        instance.dispose();
        expect(context.signal.aborted).toBe(true);
        expect(dispose).not.toHaveBeenCalled();

        finishCreate(resources);
        await Promise.resolve();
        await Promise.resolve();
        expect(dispose).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledWith(resources, context);
        await scope.dispose();
    });

    it('cleans scoped calculator registrations on unload', async () => {
        const host = installHost();
        let calculatorAudioBuffer: AudioBuffer | undefined;
        const calculator = {
            id: 'test.scoped',
            version: 1,
            featureKey: 'scoped',
            calculate: ({ audioBuffer }: { audioBuffer: AudioBuffer }) => {
                calculatorAudioBuffer = audioBuffer;
                return { frameCount: 0, channels: 1, format: 'float32' as const, data: new Float32Array() };
            },
        };
        const definition = definePluginElement({
            type: 'cleanup-test',
            metadata: { name: 'Cleanup test' },
            schema: { tabs: [] },
            load(context) {
                expect('audio' in context).toBe(false);
                context.audioCalculators!.register(calculator);
            },
            render() {
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: host,
            capabilities: { required: [PLUGIN_CAPABILITIES.audioCalculatorsRegister] },
            loadAsset: async () => 'blob:test',
            report: vi.fn(),
        });
        await scope.ready;
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(true);
        const registered = audioFeatureCalculatorRegistry.get(calculator.id)!;
        const audioBuffer = {} as AudioBuffer;
        await registered.calculate({
            audioBuffer,
            hopTicks: 1,
            hopSeconds: 1,
            frameCount: 0,
            analysisParams: { windowSize: 1, hopSize: 1, overlap: 0, sampleRate: 48_000, calculatorVersions: {} },
            analysisProfileId: 'default',
            timing: { globalBpm: 120, beatsPerBar: 4, ticksPerQuarter: 960 },
            tempoProjection: { hopTicks: 1, startTick: 0 },
            tempoMapper: {} as any,
        });
        expect(calculatorAudioBuffer).toBe(audioBuffer);
        await scope.dispose();
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(false);
    });

    it('returns every timeline track and the actual playback range', async () => {
        const timelineState = {
            timeline: { id: 'timeline', name: 'Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
            tracks: {
                midi: { id: 'midi', name: 'MIDI', type: 'midi', enabled: true, mute: false, solo: false },
                audio: { id: 'audio', name: 'Audio', type: 'audio', enabled: true, mute: true, solo: false },
            },
            tracksOrder: ['audio', 'midi'],
            audioCache: {},
            timelineView: { startTick: 0, endTick: 1920 },
            playbackRange: { startTick: 480, endTick: 1440 },
        } as any;
        const host = createPluginHostServices({
            timelineStore: { getState: () => timelineState },
            selectNotesInWindow: () => [],
            selectTrackById: (_state, id) => timelineState.tracks[id as keyof typeof timelineState.tracks],
            selectTracksByIds: (_state, ids) => ids.map((id) => timelineState.tracks[id]).filter(Boolean),
            selectMidiTracks: () => [timelineState.tracks.midi],
            getFeatureData: () => null,
            getFeatureDataRange: () => [],
        }).services;
        let context: CapabilityContext | undefined;
        const scope = createPluginDefinitionScope(
            definePluginElement({
                type: 'timeline-semantics-test',
                metadata: { name: 'Timeline semantics' },
                schema: { tabs: [] },
                render(input) {
                    context = input.context;
                    return [];
                },
            }),
            {
                pluginId: 'test',
                services: host,
                capabilities: { required: [PLUGIN_CAPABILITIES.timelineRead] },
                synchronousInitialization: true,
                loadAsset: async () => 'blob:test',
                report: vi.fn(),
            }
        );
        scope.createRegistration({ kind: 'built-in' }).create().buildRenderObjects({}, 0);
        expect(context!.timeline!.getTracks()).toEqual({
            ok: true,
            value: [
                expect.objectContaining({ id: 'audio', type: 'audio', muted: true }),
                expect.objectContaining({ id: 'midi', type: 'midi', muted: false }),
            ],
        });
        expect(context!.timeline!.getMetadata()).toEqual({
            ok: true,
            value: expect.objectContaining({
                durationSeconds: 0.75,
                playbackStartSeconds: 0.25,
                playbackEndSeconds: 0.75,
            }),
        });
        await scope.dispose();
    });
});
