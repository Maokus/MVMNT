import type { AudioFeatureDescriptor, AudioSamplingOptions } from './audioFeatureTypes';
import {
    buildDescriptorId,
    buildDescriptorMatchKey,
    clearAnalysisIntent,
    publishAnalysisIntent,
} from './analysisIntents';
import {
    createFeatureDescriptor,
    type FeatureDescriptorBuildResult,
    type FeatureDescriptorBuilderOptions,
    type FeatureDescriptorUpdateOptions,
} from './descriptorBuilder';
import { sampleFeatureFrame } from '@core/scene/elements/audioFeatureUtils';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

/**
 * Minimal shape used to identify a scene element when publishing analysis intents.
 *
 * Real scene elements satisfy this contract automatically via inheritance from
 * `SceneElement`, but the API also accepts POJOs to make testing easier.
 */
export interface SceneFeatureElementRef {
    id: string | null;
    type?: string;
}

export type FeatureInput = string | AudioFeatureDescriptor;

export interface FeatureOptions {
    bandIndex?: number | null;
    calculatorId?: string | null;
    profile?: string | null;
}

export interface FeatureDataMetadata {
    descriptor: AudioFeatureDescriptor;
    frame: AudioFeatureFrameSample;
}

export interface FeatureDataResult {
    values: number[];
    metadata: FeatureDataMetadata;
}

interface DescriptorEntry {
    descriptor: AudioFeatureDescriptor;
    id: string;
    profile: string | null;
}

interface ElementIntentState {
    trackId: string;
    descriptors: Map<string, DescriptorEntry>;
}

let elementStates = new WeakMap<object, ElementIntentState>();

export interface ElementSubscriptionSnapshot {
    trackId: string;
    descriptor: AudioFeatureDescriptor;
}

function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') return null;
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function resolveElementIdentity(element: SceneFeatureElementRef | object): { id: string | null; type: string } {
    if (element && typeof element === 'object') {
        const rawId = (element as SceneFeatureElementRef).id;
        const id = typeof rawId === 'string' && rawId.trim().length ? rawId.trim() : null;
        const rawType = (element as SceneFeatureElementRef).type;
        if (typeof rawType === 'string' && rawType.trim().length) {
            return { id, type: rawType.trim() };
        }
        const ctorName = (element as any)?.constructor?.name;
        return { id, type: typeof ctorName === 'string' && ctorName.length ? ctorName : 'unknown' };
    }
    return { id: null, type: 'unknown' };
}

type LegacyFeatureOptions = FeatureOptions & { smoothing?: number | null };

function buildDescriptor(
    feature: FeatureInput,
    options?: FeatureOptions,
): FeatureDescriptorBuildResult {
    if (typeof feature === 'string') {
        const builderOptions: FeatureDescriptorBuilderOptions = {
            feature,
            bandIndex: options?.bandIndex ?? undefined,
            calculatorId: options?.calculatorId ?? undefined,
            profile: options?.profile ?? undefined,
        };
        return createFeatureDescriptor(builderOptions);
    }
    const updateOptions: FeatureDescriptorUpdateOptions | undefined = options
        ? {
              bandIndex: options.bandIndex,
              calculatorId: options.calculatorId,
              profile: options.profile,
          }
        : undefined;
    return createFeatureDescriptor(feature, updateOptions);
}

function publishIfNeeded(
    element: SceneFeatureElementRef | object,
    state: ElementIntentState,
    identity: { id: string | null; type: string },
): void {
    if (!identity.id) {
        return;
    }
    const descriptors = Array.from(state.descriptors.values());
    if (!descriptors.length) {
        clearAnalysisIntent(identity.id);
        return;
    }
    const profile = descriptors.find((entry) => typeof entry.profile === 'string')?.profile ?? null;
    publishAnalysisIntent(
        identity.id,
        identity.type,
        state.trackId,
        descriptors.map((entry) => entry.descriptor),
        profile ? { profile } : undefined,
    );
}

function upsertDescriptorEntry(state: ElementIntentState, entry: DescriptorEntry): boolean {
    const matchKey = buildDescriptorMatchKey(entry.descriptor);
    const existing = state.descriptors.get(matchKey);
    if (!existing) {
        state.descriptors.set(matchKey, entry);
        return true;
    }
    if (existing.id !== entry.id || existing.profile !== entry.profile) {
        state.descriptors.set(matchKey, entry);
        return true;
    }
    return false;
}

function resolveInvocation(
    optionsOrTime?: FeatureOptions | number | null,
    maybeTimeOrSampling?: number | AudioSamplingOptions | null,
    maybeSampling?: AudioSamplingOptions | null,
): { options: FeatureOptions | undefined; sampling: AudioSamplingOptions | undefined; time: number } {
    let descriptorOptions: FeatureOptions | undefined;
    let samplingOptions: AudioSamplingOptions | undefined;
    let time = 0;

    if (typeof optionsOrTime === 'number') {
        time = optionsOrTime;
        samplingOptions = (maybeTimeOrSampling as AudioSamplingOptions | undefined) ?? undefined;
    } else {
        descriptorOptions = optionsOrTime ?? undefined;
        if (typeof maybeTimeOrSampling === 'number') {
            time = maybeTimeOrSampling;
            samplingOptions = maybeSampling ?? undefined;
        } else if (maybeTimeOrSampling && typeof maybeTimeOrSampling === 'object') {
            samplingOptions = maybeTimeOrSampling ?? undefined;
        }
    }

    const legacy = descriptorOptions as LegacyFeatureOptions | undefined;
    if (legacy && Object.prototype.hasOwnProperty.call(legacy, 'smoothing')) {
        const { smoothing, ...rest } = legacy;
        descriptorOptions = rest;
        if (smoothing != null) {
            const radius = typeof smoothing === 'number' && Number.isFinite(smoothing) ? smoothing : undefined;
            samplingOptions = {
                ...(samplingOptions ?? {}),
                ...(radius != null ? { smoothing: radius } : {}),
            };
        }
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                '[sceneApi] getFeatureData legacy signature detected: smoothing passed in descriptor options. ' +
                    'Pass smoothing via the samplingOptions argument instead.',
            );
        }
    }

    return {
        options: descriptorOptions,
        sampling: samplingOptions ?? undefined,
        time,
    };
}

/**
 * Lazily sample audio feature data for the provided element.
 *
 * Passing descriptor options as the fourth argument preserves backward compatibility with
 * legacy call signatures. Prefer the modern signature shown in the docs:
 * `getFeatureData(element, trackId, featureKey, time, samplingOptions?)`.
 *
 * @see ../../../docs/audio/quickstart.md
 * @see ../../../docs/audio/audio-cache-system.md
 */
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    time: number,
    samplingOptions?: AudioSamplingOptions | null,
): FeatureDataResult | null;
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    options: FeatureOptions | null | undefined,
    time: number,
    samplingOptions?: AudioSamplingOptions | null,
): FeatureDataResult | null;
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    optionsOrTime?: FeatureOptions | number | null,
    maybeTimeOrSampling?: number | AudioSamplingOptions | null,
    maybeSampling?: AudioSamplingOptions | null,
): FeatureDataResult | null {
    const { options, sampling, time } = resolveInvocation(optionsOrTime, maybeTimeOrSampling, maybeSampling);
    const normalizedTrackId = normalizeTrackId(trackId);
    const identity = resolveElementIdentity(element);

    if (!normalizedTrackId) {
        clearFeatureData(element);
        return null;
    }

    const { descriptor, profile } = buildDescriptor(feature, options);
    const descriptorId = buildDescriptorId(descriptor);

    let state = elementStates.get(element as object);
    let publishNeeded = false;

    if (!state) {
        state = {
            trackId: normalizedTrackId,
            descriptors: new Map(),
        };
        elementStates.set(element as object, state);
        publishNeeded = true;
    } else if (state.trackId !== normalizedTrackId) {
        state.trackId = normalizedTrackId;
        state.descriptors.clear();
        publishNeeded = true;
    }

    if (upsertDescriptorEntry(state, { descriptor, id: descriptorId, profile })) {
        publishNeeded = true;
    }

    if (publishNeeded) {
        publishIfNeeded(element, state, identity);
    }

    const sample = sampleFeatureFrame(normalizedTrackId, descriptor, time, sampling);
    if (!sample) {
        return null;
    }

    return {
        values: sample.values,
        metadata: {
            descriptor,
            frame: sample,
        },
    };
}

/**
 * Synchronize a set of descriptors manually.
 *
 * Use this API when elements want to manage subscriptions explicitly (for example, swapping
 * descriptors in response to animation state). The runtime still publishes intents through the
 * shared bus so diagnostics remain accurate.
 */
export function syncElementFeatureIntents(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    descriptors: AudioFeatureDescriptor[],
    profile?: string | null,
): void {
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!normalizedTrackId || descriptors.length === 0) {
        clearFeatureData(element, trackId);
        return;
    }

    let state = elementStates.get(element as object);
    let publishNeeded = false;

    if (!state) {
        state = {
            trackId: normalizedTrackId,
            descriptors: new Map(),
        };
        elementStates.set(element as object, state);
        publishNeeded = true;
    } else if (state.trackId !== normalizedTrackId) {
        state.trackId = normalizedTrackId;
        state.descriptors.clear();
        publishNeeded = true;
    }

    const requiredKeys = new Set<string>();
    for (const descriptor of descriptors) {
        if (!descriptor || !descriptor.featureKey) {
            continue;
        }
        const entry: DescriptorEntry = {
            descriptor,
            id: buildDescriptorId(descriptor),
            profile: profile ?? null,
        };
        requiredKeys.add(buildDescriptorMatchKey(descriptor));
        if (upsertDescriptorEntry(state, entry)) {
            publishNeeded = true;
        }
    }

    for (const key of Array.from(state.descriptors.keys())) {
        if (!requiredKeys.has(key)) {
            state.descriptors.delete(key);
            publishNeeded = true;
        }
    }

    if (!state.descriptors.size) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    if (publishNeeded) {
        const identity = resolveElementIdentity(element);
        publishIfNeeded(element, state, identity);
    }
}

/**
 * Retrieve the descriptors currently associated with the element.
 *
 * Useful for diagnostics tooling and unit tests that need to assert which subscriptions were
 * published.
 */
export function getElementSubscriptionSnapshot(
    element: SceneFeatureElementRef | object,
): ElementSubscriptionSnapshot[] {
    const state = elementStates.get(element as object);
    if (!state) {
        return [];
    }
    return Array.from(state.descriptors.values()).map((entry) => ({
        trackId: state.trackId,
        descriptor: entry.descriptor,
    }));
}

/**
 * Remove cached subscription state for an element and clear any published intents.
 */
export function clearFeatureData(
    element: SceneFeatureElementRef | object,
    trackId?: string | null,
): void {
    const state = elementStates.get(element as object);
    if (!state) {
        return;
    }
    const normalized = normalizeTrackId(trackId);
    if (normalized && state.trackId !== normalized) {
        return;
    }
    elementStates.delete(element as object);
    const identity = resolveElementIdentity(element);
    if (identity.id) {
        clearAnalysisIntent(identity.id);
    }
}

/**
 * Reset the internal element state map.
 *
 * Intended for test environments.
 */
export function resetSceneFeatureStateForTests(): void {
    elementStates = new WeakMap();
}
