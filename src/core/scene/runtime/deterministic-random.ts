import { SIMULATION_RANDOM_ALGORITHM, type SimulationRandomApi } from '../../../../packages/plugin-sdk/src/scene';

const UINT32_RANGE = 0x1_0000_0000;

function mix(value: number): number {
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function numberWords(value: number): readonly [number, number] {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true);
    return [view.getUint32(0, true), view.getUint32(4, true)];
}

/** Stateless, versioned random access for one canonical simulation step. */
export function createSimulationRandom(seed: number, stepIndex: number): SimulationRandomApi {
    if (!Number.isFinite(seed)) throw new Error('Simulation seed must be finite');
    if (!Number.isSafeInteger(stepIndex) || stepIndex < 0)
        throw new Error('Simulation random step index must be a non-negative safe integer');

    const [seedLow, seedHigh] = numberWords(seed);
    const stepLow = stepIndex >>> 0;
    const stepHigh = Math.floor(stepIndex / UINT32_RANGE) >>> 0;
    const scope = mix(seedLow ^ mix(seedHigh) ^ mix(stepLow) ^ mix(stepHigh));
    const uint32 = (key: string): number => {
        if (typeof key !== 'string') throw new TypeError('Simulation random key must be a string');
        return mix(scope ^ hashString(key));
    };

    return Object.freeze({
        algorithm: SIMULATION_RANDOM_ALGORITHM,
        uint32,
        float: (key: string) => uint32(key) / UINT32_RANGE,
    });
}
