import type { AudioAnalysisProfileOverrides } from '@audio/features/audioFeatureTypes';

/**
 * Internal metadata for audio feature requirements.
 * This is NOT user-configurable - it's implementation detail.
 */
export interface AudioFeatureRequirement {
    /** Feature key (e.g., 'spectrogram', 'rms', 'waveform') */
    feature: string;
    /** Optional band index for multi-band features */
    bandIndex?: number;
    /** Optional calculator ID for custom analyzers */
    calculatorId?: string;
    /** Optional analysis profile identifier to request non-default cache variants */
    profile?: string;
    /** Optional inline overrides applied to the base analysis profile. */
    profileParams?: AudioAnalysisProfileOverrides;
}

const ELEMENT_FEATURE_REQUIREMENTS = new Map<string, AudioFeatureRequirement[]>();

function cloneRequirement(requirement: AudioFeatureRequirement): AudioFeatureRequirement {
    const { feature, bandIndex, calculatorId, profile, profileParams } = requirement;
    const cloned: AudioFeatureRequirement = { feature };
    if (bandIndex != null) cloned.bandIndex = bandIndex;
    if (calculatorId != null) cloned.calculatorId = calculatorId;
    if (profile != null) cloned.profile = profile;
    if (profileParams != null) cloned.profileParams = { ...profileParams };
    return cloned;
}

/**
 * Register the audio feature requirements for a scene element type.
 *
 * Call this at module scope so requirements are available before instances render. The
 * runtime uses this registry to publish analysis intents automatically—developers do not
 * need to expose these details to end users. See {@link ../../../docs/audio/quickstart.md}
 * for end-to-end usage.
 */
export function registerFeatureRequirements(elementType: string, requirements: AudioFeatureRequirement[]): void {
    if (!elementType || !requirements) {
        return;
    }
    const sanitized = requirements
        .filter((requirement): requirement is AudioFeatureRequirement => Boolean(requirement))
        .map((requirement) => cloneRequirement(requirement));
    ELEMENT_FEATURE_REQUIREMENTS.set(elementType, sanitized);
}

/**
 * Retrieve registered feature requirements for the provided element type.
 *
 * Returns a defensive copy so callers can mutate the result without affecting the registry.
 */
export function getFeatureRequirements(elementType: string): AudioFeatureRequirement[] {
    const entries = ELEMENT_FEATURE_REQUIREMENTS.get(elementType);
    if (!entries || entries.length === 0) {
        return [];
    }
    return entries.map((entry) => cloneRequirement(entry));
}

/**
 * Clear all registered requirements.
 *
 * Intended for unit tests—production code should not reset the registry at runtime.
 */
export function resetFeatureRequirementsForTests(): void {
    ELEMENT_FEATURE_REQUIREMENTS.clear();
}
