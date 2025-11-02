import { getDefaultProfile, getFeatureDefaults } from './audioFeatureRegistry';
import {
    buildAdhocProfileId,
    enrichProfileDescriptor,
    getBaseAnalysisProfile,
    sanitizeProfileOverrides,
} from './analysisProfileRegistry';
import type {
    AudioAnalysisProfileOverrides,
    AudioFeatureAnalysisProfileDescriptor,
    AudioFeatureDescriptor,
    CanonicalAnalysisProfile,
    FeatureDescriptorDefaults,
} from './audioFeatureTypes';

export interface FeatureDescriptorBuilderOptions {
    feature: string;
    calculatorId?: string | null;
    bandIndex?: number | null;
    profile?: string | null;
    profileParams?: AudioAnalysisProfileOverrides | null;
}

export interface FeatureDescriptorUpdateOptions extends Partial<FeatureDescriptorBuilderOptions> {
    feature?: string;
}

export interface FeatureDescriptorBuildResult {
    descriptor: AudioFeatureDescriptor;
    profile: string | null;
    baseProfile: string | null;
    profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

function stableStringify(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 'null';
        if (Object.is(value, -0)) return '0';
        return value.toString();
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value as Record<string, unknown>).sort();
        return `{${entries
            .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
            .join(',')}}`;
    }
    return 'null';
}

function fnv1a64(input: string): string {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= BigInt(input.charCodeAt(i));
        hash = (hash * prime) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, '0');
}

function stableProfileHash(baseProfileId: string, profile: CanonicalAnalysisProfile): string {
    const payload = {
        baseProfileId,
        profile: {
            windowSize: profile.windowSize,
            hopSize: profile.hopSize,
            overlap: profile.overlap,
            sampleRate: profile.sampleRate,
            fftSize: profile.fftSize ?? null,
            minDecibels: profile.minDecibels ?? null,
            maxDecibels: profile.maxDecibels ?? null,
            window: profile.window ?? null,
        },
    };
    return fnv1a64(stableStringify(payload));
}

function mergeProfiles(
    baseProfile: CanonicalAnalysisProfile,
    overrides: AudioAnalysisProfileOverrides
): CanonicalAnalysisProfile {
    const merged: CanonicalAnalysisProfile = {
        windowSize: baseProfile.windowSize,
        hopSize: baseProfile.hopSize,
        overlap: baseProfile.overlap,
        sampleRate: baseProfile.sampleRate,
        fftSize: baseProfile.fftSize ?? null,
        minDecibels: baseProfile.minDecibels ?? null,
        maxDecibels: baseProfile.maxDecibels ?? null,
        window: baseProfile.window ?? null,
    };

    const assignable = merged as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(overrides) as [keyof CanonicalAnalysisProfile, unknown][]) {
        if (value === undefined) continue;
        assignable[key as string] = value;
    }

    const hasExplicitOverlap = Object.prototype.hasOwnProperty.call(overrides, 'overlap');
    if (!hasExplicitOverlap) {
        const { windowSize, hopSize } = merged;
        if (typeof windowSize === 'number' && typeof hopSize === 'number' && hopSize > 0) {
            merged.overlap = windowSize > hopSize ? windowSize / hopSize : 1;
        }
    }

    return merged;
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
    options: FeatureDescriptorBuilderOptions
): FeatureDescriptorBuildResult {
    const calculatorId =
        options.calculatorId === null ? null : sanitizeString(options.calculatorId) ?? defaults.calculatorId;
    const bandIndex =
        options.bandIndex === null ? null : sanitizeBandIndex(options.bandIndex ?? undefined) ?? defaults.bandIndex;
    const requestedProfile = sanitizeString(options.profile) ?? getDefaultProfile();
    const sanitizedOverrides = sanitizeProfileOverrides(options.profileParams);

    let analysisProfileId: string | null = requestedProfile;
    let profileOverridesHash: string | null = null;
    let profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null = null;
    let descriptorOverrides: AudioAnalysisProfileOverrides | null = null;

    if (sanitizedOverrides) {
        const baseProfile = getBaseAnalysisProfile(requestedProfile);
        const mergedProfile = mergeProfiles(baseProfile, sanitizedOverrides);
        const hash = stableProfileHash(requestedProfile, mergedProfile);
        const adhocProfileId = buildAdhocProfileId(hash.slice(0, 16));
        analysisProfileId = adhocProfileId;
        profileOverridesHash = hash;
        profileRegistryDelta = {
            [adhocProfileId]: enrichProfileDescriptor(adhocProfileId, mergedProfile),
        };
        descriptorOverrides = sanitizedOverrides;
    }

    return {
        descriptor: {
            featureKey,
            calculatorId,
            bandIndex,
            analysisProfileId,
            requestedAnalysisProfileId: requestedProfile,
            profileOverrides: descriptorOverrides,
            profileOverridesHash,
            profileRegistryDelta,
        },
        profile: analysisProfileId,
        baseProfile: requestedProfile,
        profileRegistryDelta,
    };
}

export function createFeatureDescriptor(options: FeatureDescriptorBuilderOptions): FeatureDescriptorBuildResult;
export function createFeatureDescriptor(
    descriptor: AudioFeatureDescriptor,
    updates?: FeatureDescriptorUpdateOptions
): FeatureDescriptorBuildResult;
export function createFeatureDescriptor(
    input: FeatureDescriptorBuilderOptions | AudioFeatureDescriptor,
    updates?: FeatureDescriptorUpdateOptions
): FeatureDescriptorBuildResult {
    if ('featureKey' in input) {
        const base = input;
        const featureKey = sanitizeString(updates?.feature) ?? base.featureKey;
        const defaults = resolveDefaults(featureKey);
        const merged: FeatureDescriptorBuilderOptions = {
            feature: featureKey,
            calculatorId: updates?.calculatorId ?? base.calculatorId ?? defaults.calculatorId,
            bandIndex: updates?.bandIndex ?? base.bandIndex ?? defaults.bandIndex,
            profile: updates?.profile ?? base.requestedAnalysisProfileId ?? base.analysisProfileId ?? null,
            profileParams: updates?.profileParams ?? base.profileOverrides ?? null,
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
