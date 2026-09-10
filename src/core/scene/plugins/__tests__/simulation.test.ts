import { describe, expect, it, vi } from 'vitest';
import { definePluginElement, group, prop, tab } from '../../../../../packages/plugin-sdk/src/scene';
import { createPluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { SimulationGeneration } from '@core/scene/runtime/simulation-inputs';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';

describe('simulation definition integration', () => {
    it('infers state and props and renders only exact prepared snapshots', async () => {
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
        element.buildRenderObjects({}, 1);
        expect(render).not.toHaveBeenCalled();
        await element.prepareSimulationFrame!(1, generation, () => {});
        element.buildRenderObjects({}, 1);
        expect(render).toHaveBeenLastCalledWith(123);
        await element.prepareSimulationFrame!(0, generation, () => {});
        element.buildRenderObjects({}, 0);
        expect(render).toHaveBeenLastCalledWith(3);
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
