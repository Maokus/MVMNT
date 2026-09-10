import type { AudioAnalysisProfileOverrides } from '@audio/features/audioFeatureTypes';

/**
 * Internal metadata for audio feature requirements.
 * This is NOT user-configurable - it's implementation detail.
 */
export interface AudioFeatureRequirement {
    /** Feature key (for example, 'spectrogram', 'peaks', or 'pitchGuide') */
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
const SCOPED_FEATURE_REQUIREMENTS = new Map<string, Map<symbol, AudioFeatureRequirement[]>>();

/** Constructor shape used by plugin element definitions with a stable, literal type. */
export interface TypedSceneElementConstructor<TType extends string = string> {
    readonly elementType: TType;
}

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

/** Registers requirements for one SDK callback lifecycle and returns an idempotent cleanup. */
export function registerScopedFeatureRequirements(
    elementType: string,
    requirements: readonly AudioFeatureRequirement[]
): () => void {
    const token = Symbol(elementType);
    const entries = SCOPED_FEATURE_REQUIREMENTS.get(elementType) ?? new Map();
    entries.set(
        token,
        requirements.map((requirement) => cloneRequirement(requirement))
    );
    SCOPED_FEATURE_REQUIREMENTS.set(elementType, entries);
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        const current = SCOPED_FEATURE_REQUIREMENTS.get(elementType);
        current?.delete(token);
        if (current?.size === 0) SCOPED_FEATURE_REQUIREMENTS.delete(elementType);
    };
}

/**
 * Register requirements using an element constructor's declared type.
 *
 * Define `static readonly elementType = 'my-plugin-element' as const` on the element class,
 * then pass that class here. This keeps the requirements registration tied to the same typed
 * definition used by the plugin rather than repeating a loose string at the call site.
 */
export function registerFeatureRequirementsForElement<TType extends string>(
    ElementClass: TypedSceneElementConstructor<TType>,
    requirements: AudioFeatureRequirement[]
): void {
    registerFeatureRequirements(ElementClass.elementType, requirements);
}

/**
 * Retrieve registered feature requirements for the provided element type.
 *
 * Returns a defensive copy so callers can mutate the result without affecting the registry.
 */
export function getFeatureRequirements(elementType: string): AudioFeatureRequirement[] {
    const entries = [
        ...(ELEMENT_FEATURE_REQUIREMENTS.get(elementType) ?? []),
        ...[...(SCOPED_FEATURE_REQUIREMENTS.get(elementType)?.values() ?? [])].flat(),
    ];
    return entries.map((entry) => cloneRequirement(entry));
}

/**
 * Clear all registered requirements.
 *
 * Intended for unit tests—production code should not reset the registry at runtime.
 */
export function resetFeatureRequirementsForTests(): void {
    ELEMENT_FEATURE_REQUIREMENTS.clear();
    SCOPED_FEATURE_REQUIREMENTS.clear();
}
