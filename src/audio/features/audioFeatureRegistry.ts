import { useTimelineStore } from '@state/timelineStore';
import {
    AudioFeatureCalculator,
    type AudioFeatureCalculatorRegistry,
    type FeatureDescriptorDefaults,
} from './audioFeatureTypes';

const calculators = new Map<string, AudioFeatureCalculator>();
const featureDefaults = new Map<string, FeatureDescriptorDefaults>();
const DEFAULT_PROFILE_ID = 'default';

function clampSmoothing(value: unknown, fallback: number | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback ?? 0;
    }
    const rounded = Math.round(value);
    return Math.max(0, Math.min(64, rounded));
}

function register(calculator: AudioFeatureCalculator): void {
    if (!calculator || typeof calculator.id !== 'string') {
        throw new Error('AudioFeatureCalculator must include a string id');
    }
    calculators.set(calculator.id, calculator);
    const existing = featureDefaults.get(calculator.featureKey) ?? {
        calculatorId: null,
        bandIndex: null,
        channel: null,
        smoothing: 0,
    };
    const smoothingDefault = clampSmoothing(
        (calculator.defaultParams as { smoothing?: unknown } | undefined)?.smoothing,
        existing.smoothing,
    );
    featureDefaults.set(calculator.featureKey, {
        calculatorId: calculator.id,
        bandIndex: existing.bandIndex,
        channel: existing.channel,
        smoothing: smoothingDefault,
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
            channel: defaults.channel,
            smoothing: defaults.smoothing,
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
        channel: null,
        smoothing: 0,
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
