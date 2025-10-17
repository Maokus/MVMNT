/**
 * Internal metadata for audio feature requirements.
 * This is NOT user-configurable - it's implementation detail.
 */
export interface AudioFeatureRequirement {
    /** Feature key (e.g., 'spectrogram', 'rms', 'waveform') */
    feature: string;
    /** Optional channel specification */
    channel?: number | string;
    /** Optional band index for multi-band features */
    bandIndex?: number;
    /** Optional calculator ID for custom analyzers */
    calculatorId?: string;
}

const ELEMENT_FEATURE_REQUIREMENTS = new Map<string, AudioFeatureRequirement[]>();

function cloneRequirement(requirement: AudioFeatureRequirement): AudioFeatureRequirement {
    const { feature, channel, bandIndex, calculatorId } = requirement;
    const cloned: AudioFeatureRequirement = { feature };
    if (channel != null) cloned.channel = channel;
    if (bandIndex != null) cloned.bandIndex = bandIndex;
    if (calculatorId != null) cloned.calculatorId = calculatorId;
    return cloned;
}

export function registerFeatureRequirements(
    elementType: string,
    requirements: AudioFeatureRequirement[],
): void {
    if (!elementType || !requirements) {
        return;
    }
    const sanitized = requirements
        .filter((requirement): requirement is AudioFeatureRequirement => Boolean(requirement))
        .map((requirement) => cloneRequirement(requirement));
    ELEMENT_FEATURE_REQUIREMENTS.set(elementType, sanitized);
}

export function getFeatureRequirements(elementType: string): AudioFeatureRequirement[] {
    const entries = ELEMENT_FEATURE_REQUIREMENTS.get(elementType);
    if (!entries || entries.length === 0) {
        return [];
    }
    return entries.map((entry) => cloneRequirement(entry));
}

export function resetFeatureRequirementsForTests(): void {
    ELEMENT_FEATURE_REQUIREMENTS.clear();
}
