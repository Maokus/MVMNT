import type {
    AudioAnalysisProfileOverrides,
    AudioFeatureAnalysisProfileDescriptor,
    CanonicalAnalysisProfile,
} from './audioFeatureTypes';

const AD_HOC_PROFILE_PREFIX = 'adhoc-';

const BUILTIN_PROFILES: Record<string, CanonicalAnalysisProfile> = {
    default: {
        windowSize: 2048,
        hopSize: 512,
        overlap: 2048 / 512,
        sampleRate: 0,
        fftSize: null,
        minDecibels: -80,
        maxDecibels: 0,
        window: 'hann',
    },
};

function cloneProfile(profile: CanonicalAnalysisProfile): CanonicalAnalysisProfile {
    return {
        windowSize: profile.windowSize,
        hopSize: profile.hopSize,
        overlap: profile.overlap,
        sampleRate: profile.sampleRate,
        fftSize: profile.fftSize ?? null,
        minDecibels: profile.minDecibels ?? null,
        maxDecibels: profile.maxDecibels ?? null,
        window: profile.window ?? null,
    };
}

export function getBaseAnalysisProfile(profileId: string | null | undefined): CanonicalAnalysisProfile {
    const normalized = typeof profileId === 'string' && profileId.trim().length ? profileId.trim() : 'default';
    const preset = BUILTIN_PROFILES[normalized] ?? BUILTIN_PROFILES.default;
    return cloneProfile(preset);
}

export function enrichProfileDescriptor(
    profileId: string,
    profile: CanonicalAnalysisProfile
): AudioFeatureAnalysisProfileDescriptor {
    return {
        id: profileId,
        windowSize: profile.windowSize,
        hopSize: profile.hopSize,
        overlap: profile.overlap,
        sampleRate: profile.sampleRate,
        fftSize: profile.fftSize ?? null,
        minDecibels: profile.minDecibels ?? null,
        maxDecibels: profile.maxDecibels ?? null,
        window: profile.window ?? null,
    };
}

const PROFILE_NUMERIC_KEYS = new Set<keyof CanonicalAnalysisProfile>([
    'windowSize',
    'hopSize',
    'overlap',
    'sampleRate',
    'fftSize',
    'minDecibels',
    'maxDecibels',
]);

const PROFILE_STRING_KEYS = new Set<keyof CanonicalAnalysisProfile>(['window']);

export function sanitizeProfileOverrides(
    overrides: AudioAnalysisProfileOverrides | null | undefined
): AudioAnalysisProfileOverrides | null {
    if (!overrides || typeof overrides !== 'object') {
        return null;
    }
    const result: AudioAnalysisProfileOverrides = {};
    for (const [key, value] of Object.entries(overrides) as [keyof CanonicalAnalysisProfile, unknown][]) {
        if (!(key in BUILTIN_PROFILES.default)) {
            continue;
        }
        if (value === undefined) {
            continue;
        }
        if (PROFILE_NUMERIC_KEYS.has(key)) {
            if (value === null) {
                (result as any)[key] = null;
                continue;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                (result as any)[key] = value;
            }
            continue;
        }
        if (PROFILE_STRING_KEYS.has(key)) {
            if (value === null) {
                (result as any)[key] = null;
                continue;
            }
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed.length) {
                    (result as any)[key] = trimmed;
                }
            }
        }
    }
    return Object.keys(result).length ? result : null;
}

export function isAdhocAnalysisProfileId(value: string | null | undefined): boolean {
    if (typeof value !== 'string') {
        return false;
    }
    return value.startsWith(AD_HOC_PROFILE_PREFIX);
}

export function buildAdhocProfileId(hash: string): string {
    return `${AD_HOC_PROFILE_PREFIX}${hash}`;
}
