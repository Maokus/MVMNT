import { useTimelineStore } from '@state/timelineStore';
import { AudioFeatureCalculator, type AudioFeatureCalculatorRegistry } from './audioFeatureTypes';

const calculators = new Map<string, AudioFeatureCalculator>();

function register(calculator: AudioFeatureCalculator): void {
    if (!calculator || typeof calculator.id !== 'string') {
        throw new Error('AudioFeatureCalculator must include a string id');
    }
    calculators.set(calculator.id, calculator);
    try {
        useTimelineStore
            .getState()
            .invalidateAudioFeatureCachesByCalculator(calculator.id, calculator.version);
    } catch {
        /* store may not be initialized yet */
    }
}

function unregister(id: string): void {
    calculators.delete(id);
}

function get(id: string): AudioFeatureCalculator | undefined {
    return calculators.get(id);
}

function list(): AudioFeatureCalculator[] {
    return Array.from(calculators.values());
}

export const audioFeatureCalculatorRegistry: AudioFeatureCalculatorRegistry = {
    register,
    unregister,
    get,
    list,
};

export function resetAudioFeatureCalculators(): void {
    calculators.clear();
}
