import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginHostApi, PLUGIN_CAPABILITIES } from '../host-api/plugin-api';
import { createPluginDefinitionScope } from '../v2-runtime';
import { definePluginElement, type CapabilityContext } from '../sdk/scene';

const previousMvmnt = (globalThis as any).MVMNT;

afterEach(() => {
    (globalThis as any).MVMNT = previousMvmnt;
});

function installHost() {
    const state = {
        timeline: { id: 'timeline', name: 'Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
        tracks: {}, tracksOrder: [], audioCache: {}, timelineView: { startTick: 0, endTick: 1920 },
    } as any;
    const host = createPluginHostApi({
        timelineStore: { getState: () => state },
        selectNotesInWindow: () => [],
        selectTrackById: () => undefined,
        selectTracksByIds: () => [],
        selectMidiTracks: () => [],
        getFeatureData: () => null,
        getFeatureDataRange: () => [],
    }).api;
    (globalThis as any).MVMNT = { plugins: host };
    return host;
}

describe('SDK v2 runtime', () => {
    it('keeps undeclared operations away from internal services', async () => {
        const host = installHost();
        const rawSpy = vi.spyOn(host.audio, 'getRawSamples');
        let context!: CapabilityContext;
        const definition = definePluginElement({
            type: 'capability-test', metadata: { name: 'Capability test' }, schema: { tabs: [] },
            capabilities: { required: [PLUGIN_CAPABILITIES.audioFeaturesRead], optional: [] },
            load(value) { context = value; },
            render() { return []; },
        });
        // The callback runtime receives the host directly. It must not fall
        // back to the frozen SDK 1 global accessor after scope construction.
        (globalThis as any).MVMNT = undefined;
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test', services: host, loadAsset: async () => 'blob:test', report: vi.fn(),
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
            type: 'async-test', metadata: { name: 'Async test' }, schema: { tabs: [] },
            capabilities: { required: [], optional: [] },
            create: () => new Promise<void>((resolve) => { finishCreate = resolve; }),
            render,
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test', services: host, loadAsset: async () => 'blob:test', report: vi.fn(),
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
        const calculator = { id: 'test.scoped', version: 1, featureKey: 'scoped', calculate: () => ({ frameCount: 0, channels: 1, format: 'float32' as const, data: new Float32Array() }) };
        const definition = definePluginElement({
            type: 'cleanup-test', metadata: { name: 'Cleanup test' }, schema: { tabs: [] },
            capabilities: { required: [PLUGIN_CAPABILITIES.audioCalculatorsRegister], optional: [] },
            load(context) { context.audioCalculators!.register(calculator); },
            render() { return []; },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test', services: host, loadAsset: async () => 'blob:test', report: vi.fn(),
        });
        await scope.ready;
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(true);
        await scope.dispose();
        expect(host.audioCalculators.list().some((entry) => entry.id === calculator.id)).toBe(false);
    });
});
