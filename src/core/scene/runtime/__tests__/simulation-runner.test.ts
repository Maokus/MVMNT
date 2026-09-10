import { describe, expect, it, vi } from 'vitest';
import {
    SimulationRunner,
    SimulationPending,
    copySimulationData,
    simulationStepAt,
    type SimulationInputs,
} from '../simulation-runner';

const inputs = (): SimulationInputs => ({
    identity: {},
    propsAt: () => ({ seed: 7 }),
    contextAt: () => ({}) as any,
    checkReads() {},
});
const definition = {
    initialize: () => ({ position: 0, velocity: 1, particles: new Float32Array([2]) }),
    step: ({ state, deltaSeconds }: any) => ({ ...state, position: state.position + state.velocity * deltaSeconds }),
};

describe('canonical simulation', () => {
    it('matches fresh replay through shuffled seeks and checkpoint eviction', async () => {
        const input = inputs();
        const runner = new SimulationRunner(definition, () => {}, { checkpoints: 1, bytes: 1024 });
        for (const time of [3, 1, 4, -1, 2.123, 2.123, 0]) {
            const fresh = new SimulationRunner(definition, () => {});
            await runner.prepare(time, input);
            await fresh.prepare(time, inputs());
            expect(runner.snapshot(time)).toEqual(fresh.snapshot(time));
            fresh.dispose();
        }
        runner.dispose();
    });

    it('isolates render and step typed-array mutations from saved checkpoints', async () => {
        const runner = new SimulationRunner(
            {
                ...definition,
                step: ({ state }: any) => {
                    state.particles[0]++;
                    return state;
                },
            },
            () => {}
        );
        const input = inputs();
        await runner.prepare(0, input);
        runner.snapshot(0)!.state.particles[0] = 999;
        await runner.prepare(1 / 120, input);
        expect(runner.snapshot(1 / 120)!.state.particles[0]).toBe(3);
        await runner.prepare(0, input);
        expect(runner.snapshot(0)!.state.particles[0]).toBe(2);
        runner.dispose();
    });

    it('never publishes pending steps and retries with a ready generation', async () => {
        let pending = false;
        const input = inputs();
        input.contextAt = () => {
            pending = true;
            return {} as any;
        };
        input.checkReads = () => {
            if (pending) throw new SimulationPending('waiting');
        };
        const runner = new SimulationRunner(definition, () => {});
        await expect(runner.prepare(1, input)).rejects.toThrow('not ready');
        expect(runner.snapshot(1)).toBeUndefined();
        expect(runner.status).toBe('pending');
        await runner.prepare(1, inputs());
        expect(runner.snapshot(1)?.stepIndex).toBe(120);
        runner.dispose();
    });

    it('completes nearby playback requests before the preview renders', () => {
        const runner = new SimulationRunner(definition, () => {});
        const input = inputs();

        runner.request(0, input);
        expect(runner.status).toBe('ready');
        expect(runner.snapshot(0)?.stepIndex).toBe(0);

        runner.request(2 / 120, input);
        expect(runner.status).toBe('ready');
        expect(runner.snapshot(2 / 120)?.stepIndex).toBe(2);
        runner.dispose();
    });

    it('cancels obsolete seeks and disposal wakes waiters', async () => {
        const runner = new SimulationRunner(definition, vi.fn());
        const input = inputs();
        const obsolete = runner.prepare(100, input);
        const rejected = expect(obsolete).rejects.toMatchObject({ name: 'AbortError' });
        runner.request(0, input);
        await rejected;
        const active = runner.prepare(100, input);
        const disposed = expect(active).rejects.toMatchObject({ name: 'AbortError' });
        runner.dispose();
        await disposed;
    });

    it('rejects resources, cycles, and invalid numbers', () => {
        const cycle: any = {};
        cycle.self = cycle;
        for (const value of [
            cycle,
            new Date(),
            () => {},
            NaN,
            {
                get value() {
                    return 1;
                },
            },
        ])
            expect(() => copySimulationData(value)).toThrow();
    });

    it('uses completed canonical steps with only floating-point boundary tolerance', () => {
        expect(simulationStepAt(0.3, 0.1)).toBe(3);
        expect(simulationStepAt(0.3 - 1e-9, 0.1)).toBe(2);
        expect(simulationStepAt(-10, 0.1)).toBe(0);
    });
});
