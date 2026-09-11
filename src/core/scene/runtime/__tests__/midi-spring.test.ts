import { describe, expect, it } from 'vitest';
import { midiSpring } from '../../../../../packages/create-mvmnt-plugin/templates/midi-spring/src/element';
import { SimulationRunner, type SimulationInputs } from '../simulation-runner';
import { ok } from '../../../../../packages/plugin-sdk/src/api';

describe('MIDI spring export stability', () => {
    it.each([
        [30, 2],
        [100_000, 2],
        [30, 1000],
    ])('prepares a long exact replay with stiffness %s and damping %s', async (stiffness, damping) => {
        const inputs: SimulationInputs = {
            identity: {},
            propsAt: () => ({ seed: 1, midiTrackId: 'notes', stiffness, damping, strength: 800 }),
            contextAt: (step) => ({ noteOns: () => ok(step % 120 === 0 ? [{}] : []) }) as any,
            checkReads() {},
        };
        const runner = new SimulationRunner(midiSpring.simulation!, () => {});
        try {
            await runner.prepare(30, inputs);
            const state = runner.snapshot(30)!.state;
            expect(Number.isFinite(state.position)).toBe(true);
            expect(Number.isFinite(state.velocity)).toBe(true);
            expect(Math.abs(state.position)).toBeLessThan(1000);
            await runner.prepare(0, inputs);
            await runner.prepare(30, inputs);
            expect(runner.snapshot(30)!.state).toEqual(state);
        } finally {
            runner.dispose();
        }
    });
});
