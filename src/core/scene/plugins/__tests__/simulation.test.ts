import { describe, expect, it, vi } from 'vitest';
import { definePluginElement, group, prop, tab } from '../../../../../packages/plugin-sdk/src/scene';
import { createPluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { SimulationGeneration } from '@core/scene/runtime/simulation-inputs';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { Rectangle, Text } from '@core/render/render-objects';
import { SimulationPending } from '@core/scene/runtime/simulation-runner';

const renderedText = (objects: any[]) =>
    objects.flatMap((object) => object.children ?? []).filter((object): object is Text => object instanceof Text);

describe('simulation definition integration', () => {
    it('infers state and props and renders only exact prepared snapshots', async () => {
        let now = 0;
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
        const render = vi.fn();
        const definition = definePluginElement({
            type: 'simulation-test',
            metadata: { name: 'Simulation' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: ({ seed }) => ({ count: seed }),
                step: ({ state }) => ({ count: state.count + 1 }),
            },
            render(input) {
                render(input.simulation.state.count);
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());
        const placeholder = element.buildRenderObjects({}, 1);
        expect(render).not.toHaveBeenCalled();
        expect(renderedText(placeholder).map((text) => text.text)).toContain('Waiting to prepare simulation');
        await element.prepareSimulationFrame!(1, generation, () => {});
        element.buildRenderObjects({}, 1);
        expect(render).not.toHaveBeenCalled();
        now = 151;
        element.buildRenderObjects({}, 1);
        expect(render).toHaveBeenLastCalledWith(123);
        await element.prepareSimulationFrame!(0, generation, () => {});
        element.buildRenderObjects({}, 0);
        expect(render).toHaveBeenLastCalledWith(3);
        await scope.dispose();
        nowSpy.mockRestore();
    });

    it('shows the pending reason inside the element placeholder', async () => {
        const definition = definePluginElement({
            type: 'simulation-pending-test',
            metadata: { name: 'Pending simulation' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: () => ({ count: 0 }),
                step: () => {
                    throw new SimulationPending('Audio analysis is still running');
                },
            },
            render: () => [new Rectangle(0, 0, 200, 100)],
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());

        await expect(element.prepareSimulationFrame!(1 / 120, generation, () => {})).rejects.toThrow(
            'Audio analysis is still running'
        );
        const placeholder = element.buildRenderObjects({}, 1 / 120);
        expect(renderedText(placeholder).map((text) => text.text)).toContain('Audio analysis is still running');
        expect(element.getSimulationReadiness?.()).toMatchObject({
            status: 'pending',
            reason: 'Audio analysis is still running',
        });
        await scope.dispose();
    });

    it('renders a prepared export snapshot without preview placeholder hysteresis', async () => {
        let now = 0;
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
        const render = vi.fn(() => [new Rectangle(0, 0, 20, 20)]);
        const definition = definePluginElement({
            type: 'simulation-export-test',
            metadata: { name: 'Simulation export' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: ({ seed }) => ({ count: seed }),
                step: ({ state }) => ({ count: state.count + 1 }),
            },
            render,
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());

        const placeholder = element.buildRenderObjects({}, 1);
        expect(renderedText(placeholder).map((text) => text.text)).toContain('Waiting to prepare simulation');
        const exportSession = {};
        await element.prepareSimulationFrame!(1, generation, () => {}, undefined, exportSession);
        const exported = element.buildRenderObjects({}, 1);

        expect(render).toHaveBeenCalledOnce();
        expect(exported.flatMap((object) => object.children ?? [])).toEqual([expect.any(Rectangle)]);
        expect(renderedText(exported)).toHaveLength(0);
        element.releaseSimulationSession?.(exportSession);
        await scope.dispose();
        nowSpy.mockRestore();
    });

    it('matches preview and export sessions across different frame request rates', async () => {
        let renderedState: unknown;
        const definition = definePluginElement({
            type: 'simulation-session-determinism-test',
            metadata: { name: 'Simulation sessions' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 9)])])] },
            simulation: {
                initialize: ({ random }) => ({ particles: [random.float('particle-0-x')] }),
                step: ({ state, context }) => ({
                    particles: [state.particles[0] + context.random.float('particle-0-drift')],
                }),
            },
            render({ simulation }) {
                renderedState = simulation.state;
                return [];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());

        for (let frame = 0; frame <= 24; frame++)
            await element.prepareSimulationFrame!(frame / 24, generation, () => {});
        element.buildRenderObjects({}, 1);
        const previewState = renderedState;

        const exportSession = {};
        for (let frame = 0; frame <= 30; frame++)
            await element.prepareSimulationFrame!(frame / 30, generation, () => {}, undefined, exportSession);
        element.buildRenderObjects({}, 1);

        expect(renderedState).toEqual(previewState);
        element.releaseSimulationSession?.(exportSession);
        await scope.dispose();
    });

    it('holds the last complete output briefly before showing a preparation placeholder', async () => {
        let now = 0;
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
        const definition = definePluginElement({
            type: 'simulation-hysteresis-test',
            metadata: { name: 'Simulation hysteresis' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: () => ({ count: 0 }),
                step: ({ state }) => ({ count: state.count + 1 }),
            },
            render: () => [new Rectangle(0, 0, 320, 180, { fillColor: '#123456' })],
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());
        await element.prepareSimulationFrame!(0, generation, () => {});
        element.buildRenderObjects({}, 0);

        element.requestSimulationFrame!(10, generation, () => {});
        const retained = element.buildRenderObjects({}, 10);
        expect(renderedText(retained)).toHaveLength(0);

        now = 151;
        const placeholder = element.buildRenderObjects({}, 10);
        expect(renderedText(placeholder).map((text) => text.text)).toContain('Preparing simulation');

        await scope.dispose();
        nowSpy.mockRestore();
    });

    it('keeps rendering completed simulation output while playback catches up', async () => {
        const renderedSteps: number[] = [];
        const definition = definePluginElement({
            type: 'simulation-playback-catch-up-test',
            metadata: { name: 'Simulation playback catch-up' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: () => ({ count: 0 }),
                step: ({ state }) => ({ count: state.count + 1 }),
            },
            render({ simulation }) {
                renderedSteps.push(simulation.stepIndex);
                return [new Rectangle(0, 0, 320, 180, { fillColor: '#123456' })];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());
        const initial = element.buildRenderObjects({ isPlaying: true }, 0);
        expect(renderedText(initial).map((text) => text.text)).toContain('Waiting to prepare simulation');
        await element.prepareSimulationFrame!(0, generation, () => {});
        element.buildRenderObjects({ isPlaying: true }, 0);

        element.requestSimulationFrame!(10, generation, () => {});
        const retained = element.buildRenderObjects({ isPlaying: true }, 10);

        expect(renderedText(retained)).toHaveLength(0);
        expect(renderedSteps).toEqual([0, 0]);
        expect(element.getSimulationReadiness?.()).toMatchObject({
            status: 'preparing',
            hasRenderableFrame: true,
            lagSteps: 1200,
        });
        await scope.dispose();
    });

    it('keeps rendered output visible during transient playback input waits', async () => {
        let inputsPending = false;
        const renderedSteps: number[] = [];
        const definition = definePluginElement({
            type: 'simulation-playback-pending-test',
            metadata: { name: 'Simulation playback pending' },
            schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 3)])])] },
            simulation: {
                initialize: () => ({ count: 0 }),
                step: ({ state }) => {
                    if (inputsPending) throw new SimulationPending('Audio analysis is pending');
                    return { count: state.count + 1 };
                },
            },
            render({ simulation }) {
                renderedSteps.push(simulation.stepIndex);
                return [new Rectangle(0, 0, 320, 180, { fillColor: '#123456' })];
            },
        });
        const scope = createPluginDefinitionScope(definition, {
            pluginId: 'test',
            services: null,
            synchronousInitialization: true,
            loadAsset: async () => '',
            report: vi.fn(),
        });
        const element = scope.createRegistration({ kind: 'built-in' }).create();
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());
        await element.prepareSimulationFrame!(0, generation, () => {});
        element.buildRenderObjects({ isPlaying: true }, 0);

        inputsPending = true;
        element.requestSimulationFrame!(1 / 120, generation, () => {});
        const retained = element.buildRenderObjects({ isPlaying: true }, 1 / 120);

        expect(renderedText(retained)).toHaveLength(0);
        expect(renderedSteps).toEqual([0]);
        expect(element.getSimulationReadiness?.()).toMatchObject({
            status: 'pending',
            reason: 'Audio analysis is pending',
            hasRenderableFrame: true,
        });
        await scope.dispose();
    });

    it('requires a numeric authored seed and a valid fixed step', () => {
        expect(() =>
            definePluginElement({
                type: 'bad',
                metadata: { name: 'Bad' },
                schema: { tabs: [] },
                simulation: { initialize: () => 0, step: ({ state }) => state },
                render: () => [],
            })
        ).toThrow('seed');
    });
});
