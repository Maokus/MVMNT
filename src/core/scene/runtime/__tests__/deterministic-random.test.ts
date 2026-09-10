import { describe, expect, it } from 'vitest';
import { SIMULATION_RANDOM_ALGORITHM } from '../../../../../packages/plugin-sdk/src/scene';
import { createSimulationRandom } from '../deterministic-random';

describe('deterministic simulation random', () => {
    it('returns stable values for the same seed, step, and key', () => {
        const first = createSimulationRandom(42.5, 120);
        const second = createSimulationRandom(42.5, 120);

        expect(first.algorithm).toBe(SIMULATION_RANDOM_ALGORITHM);
        expect(first.uint32('particle-12-x')).toBe(277_117_015);
        expect(first.uint32('particle-12-x')).toBe(second.uint32('particle-12-x'));
        expect(first.float('particle-12-x')).toBe(second.float('particle-12-x'));
        expect(first.float('particle-12-x')).toBe(first.uint32('particle-12-x') / 0x1_0000_0000);
    });

    it('separates stable keys and seeds', () => {
        const random = createSimulationRandom(42, 12);
        expect(random.uint32('particle-12-x')).not.toBe(random.uint32('particle-12-y'));
        expect(createSimulationRandom(42, 12).uint32('particle-12-x')).not.toBe(
            createSimulationRandom(43, 12).uint32('particle-12-x')
        );
    });

    it('rejects unstable input types', () => {
        expect(() => createSimulationRandom(Infinity, 0)).toThrow('seed');
        expect(() => createSimulationRandom(1, 0.5)).toThrow('step index');
        expect(() => createSimulationRandom(1, 0).float(12 as any)).toThrow('key must be a string');
    });
});
