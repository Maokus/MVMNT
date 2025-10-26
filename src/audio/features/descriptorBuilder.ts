import { getDefaultProfile, getFeatureDefaults } from './audioFeatureRegistry';
import type { AudioFeatureDescriptor, FeatureDescriptorDefaults } from './audioFeatureTypes';

export interface FeatureDescriptorBuilderOptions {
    feature: string;
    calculatorId?: string | null;
    bandIndex?: number | null;
    profile?: string | null;
}

export interface FeatureDescriptorUpdateOptions extends Partial<FeatureDescriptorBuilderOptions> {
    feature?: string;
}

export interface FeatureDescriptorBuildResult {
    descriptor: AudioFeatureDescriptor;
    profile: string | null;
}

function sanitizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function sanitizeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    return Math.trunc(value);
}

function sanitizeBandIndex(value: unknown): number | null {
    const integer = sanitizeInteger(value);
    if (integer == null) return null;
    return integer < 0 ? 0 : integer;
}

function resolveDefaults(featureKey: string): FeatureDescriptorDefaults {
    const registryDefaults = getFeatureDefaults(featureKey);
    return {
        calculatorId: registryDefaults?.calculatorId ?? null,
        bandIndex: registryDefaults?.bandIndex ?? null,
    };
}

function buildFromOptions(
    featureKey: string,
    defaults: FeatureDescriptorDefaults,
    options: FeatureDescriptorBuilderOptions,
): FeatureDescriptorBuildResult {
    const calculatorId =
        options.calculatorId === null
            ? null
            : sanitizeString(options.calculatorId) ?? defaults.calculatorId;
    const bandIndex =
        options.bandIndex === null
            ? null
            : sanitizeBandIndex(options.bandIndex ?? undefined) ?? defaults.bandIndex;
    const profile = sanitizeString(options.profile) ?? getDefaultProfile();
    return {
        descriptor: {
            featureKey,
            calculatorId,
            bandIndex,
        },
        profile,
    };
}

export function createFeatureDescriptor(options: FeatureDescriptorBuilderOptions): FeatureDescriptorBuildResult;
export function createFeatureDescriptor(
    descriptor: AudioFeatureDescriptor,
    updates?: FeatureDescriptorUpdateOptions,
): FeatureDescriptorBuildResult;
export function createFeatureDescriptor(
    input: FeatureDescriptorBuilderOptions | AudioFeatureDescriptor,
    updates?: FeatureDescriptorUpdateOptions,
): FeatureDescriptorBuildResult {
    if ('featureKey' in input) {
        const base = input;
        const featureKey = sanitizeString(updates?.feature) ?? base.featureKey;
        const defaults = resolveDefaults(featureKey);
        const merged: FeatureDescriptorBuilderOptions = {
            feature: featureKey,
            calculatorId: updates?.calculatorId ?? base.calculatorId ?? defaults.calculatorId,
            bandIndex: updates?.bandIndex ?? base.bandIndex ?? defaults.bandIndex,
            profile: updates?.profile ?? null,
        };
        return buildFromOptions(featureKey, defaults, merged);
    }
    const featureKey = sanitizeString(input.feature) ?? '';
    if (!featureKey) {
        throw new Error('createFeatureDescriptor requires a feature key');
    }
    const defaults = resolveDefaults(featureKey);
    return buildFromOptions(featureKey, defaults, input);
}
