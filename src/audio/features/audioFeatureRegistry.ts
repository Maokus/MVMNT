import { useTimelineStore } from '@state/timelineStore';
import {
    AudioFeatureCalculator,
    type AudioFeatureCalculatorRegistry,
    type FeatureDescriptorDefaults,
} from './audioFeatureTypes';

const calculators = new Map<string, AudioFeatureCalculator>();
const featureDefaults = new Map<string, FeatureDescriptorDefaults>();
const DEFAULT_PROFILE_ID = 'default';

function register(calculator: AudioFeatureCalculator): void {
    if (!calculator || typeof calculator.id !== 'string') {
        throw new Error('AudioFeatureCalculator must include a string id');
    }
    calculators.set(calculator.id, calculator);
    const existing = featureDefaults.get(calculator.featureKey) ?? {
        calculatorId: null,
        bandIndex: null,
    };
    featureDefaults.set(calculator.featureKey, {
        calculatorId: calculator.id,
        bandIndex: existing.bandIndex,
    });
    try {
        useTimelineStore
            .getState()
            .invalidateAudioFeatureCachesByCalculator(calculator.id, calculator.version);
    } catch {
        /* store may not be initialized yet */
    }
}

function unregister(id: string): void {
    const calculator = calculators.get(id);
    calculators.delete(id);
    if (!calculator) {
        return;
    }
    const defaults = featureDefaults.get(calculator.featureKey);
    if (defaults && defaults.calculatorId === id) {
        featureDefaults.set(calculator.featureKey, {
            calculatorId: null,
            bandIndex: defaults.bandIndex,
        });
    }
}

function get(id: string): AudioFeatureCalculator | undefined {
    return calculators.get(id);
}

function list(): AudioFeatureCalculator[] {
    return Array.from(calculators.values());
}

function getDefaultProfile(): string {
    return DEFAULT_PROFILE_ID;
}

function getFeatureDefaults(featureKey: string): FeatureDescriptorDefaults {
    const defaults = featureDefaults.get(featureKey);
    if (defaults) {
        return defaults;
    }
    return {
        calculatorId: null,
        bandIndex: null,
    };
}

export const audioFeatureCalculatorRegistry: AudioFeatureCalculatorRegistry = {
    register,
    unregister,
    get,
    list,
    getDefaultProfile,
    getFeatureDefaults,
};

export function resetAudioFeatureCalculators(): void {
    calculators.clear();
    featureDefaults.clear();
}

export { getDefaultProfile, getFeatureDefaults };
