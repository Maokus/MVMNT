import type {
    AudioFeatureAnalysisProfileDescriptor,
    AudioFeatureDescriptor,
    AudioSamplingOptions,
    ChannelLayoutMeta,
} from './audioFeatureTypes';
import {
    buildDescriptorId,
    buildDescriptorIdentityKey,
    buildDescriptorMatchKey,
    clearAnalysisIntent,
    publishAnalysisIntent,
} from './analysisIntents';
import {
    createFeatureDescriptor,
    type FeatureDescriptorBuildResult,
    type FeatureDescriptorBuilderOptions,
} from './descriptorBuilder';
import { sampleFeatureFrame } from '@audio/audioFeatureUtils';
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

export interface FeatureDataMetadata {
    descriptor: AudioFeatureDescriptor;
    frame: AudioFeatureFrameSample;
    channels: number;
    channelAliases?: string[] | null;
    channelLayout?: ChannelLayoutMeta | null;
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
    profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

let elementStates = new WeakMap<object, ElementIntentState>();
const fallbackElementIds = new WeakMap<object, string>();
let fallbackElementIdCounter = 0;

function slugifyElementType(value: string): string {
    const sanitized = value.trim().toLowerCase();
    const slug = sanitized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.length ? slug : 'unknown';
}

function getOrCreateFallbackElementId(element: object, elementType: string): string {
    const existing = fallbackElementIds.get(element);
    if (existing) {
        return existing;
    }
    fallbackElementIdCounter += 1;
    const slug = slugifyElementType(elementType);
    const generated = `__feature:${slug}:${fallbackElementIdCounter.toString(36)}`;
    fallbackElementIds.set(element, generated);
    return generated;
}

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
        let resolvedType: string;
        if (typeof rawType === 'string' && rawType.trim().length) {
            resolvedType = rawType.trim();
        } else {
            const ctorName = (element as any)?.constructor?.name;
            resolvedType = typeof ctorName === 'string' && ctorName.length ? ctorName : 'unknown';
        }

        if (id) {
            fallbackElementIds.delete(element as object);
            return { id, type: resolvedType };
        }

        if (typeof rawType === 'string' && rawType.trim().length) {
            const fallbackId = getOrCreateFallbackElementId(element as object, resolvedType);
            return { id: fallbackId, type: resolvedType };
        }

        return { id: null, type: resolvedType };
    }
    return { id: null, type: 'unknown' };
}

function buildDescriptor(feature: FeatureInput): FeatureDescriptorBuildResult {
    if (typeof feature === 'string') {
        const builderOptions: FeatureDescriptorBuilderOptions = {
            feature,
        };
        return createFeatureDescriptor(builderOptions);
    }
    return createFeatureDescriptor(feature);
}

function publishIfNeeded(
    element: SceneFeatureElementRef | object,
    state: ElementIntentState,
    identity: { id: string | null; type: string }
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
    const options =
        profile || state.profileRegistryDelta
            ? {
                  profile: profile ?? undefined,
                  profileRegistryDelta: state.profileRegistryDelta ?? undefined,
              }
            : undefined;
    publishAnalysisIntent(
        identity.id,
        identity.type,
        state.trackId,
        descriptors.map((entry) => entry.descriptor),
        options
    );
}

function upsertDescriptorEntry(state: ElementIntentState, entry: DescriptorEntry): boolean {
    const identityKey = buildDescriptorIdentityKey(entry.descriptor);
    const existing = state.descriptors.get(identityKey);
    if (!existing) {
        state.descriptors.set(identityKey, entry);
        return true;
    }
    const existingHash = existing.descriptor.profileOverridesHash ?? null;
    const nextHash = entry.descriptor.profileOverridesHash ?? null;
    const profileId = existing.profile;
    const nextProfileId = entry.profile;
    if (existing.id !== entry.id || profileId !== nextProfileId || existingHash !== nextHash) {
        state.descriptors.set(identityKey, entry);
        return true;
    }
    return false;
}

/**
 * Lazily sample audio feature data for the provided element.
 *
 * Sampling options describe presentation-time adjustments applied after retrieving cached data.
 *
 * @see ../../../docs/audio/quickstart.md
 * @see ../../../docs/audio/audio-cache-system.md
 */
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    time: number,
    samplingOptions?: AudioSamplingOptions | null
): FeatureDataResult | null {
    const normalizedTrackId = normalizeTrackId(trackId);
    const identity = resolveElementIdentity(element);

    if (!normalizedTrackId) {
        clearFeatureData(element);
        return null;
    }

    let state = elementStates.get(element as object);
    let publishNeeded = false;

    if (!state) {
        state = {
            trackId: normalizedTrackId,
            descriptors: new Map(),
            profileRegistryDelta: null,
        };
        elementStates.set(element as object, state);
        publishNeeded = true;
    } else if (state.trackId !== normalizedTrackId) {
        state.trackId = normalizedTrackId;
        state.descriptors.clear();
        state.profileRegistryDelta = null;
        publishNeeded = true;
    }

    const workingState = state!;

    const { descriptor: builtDescriptor, profile: defaultProfile } = buildDescriptor(feature);
    let descriptor = builtDescriptor;
    let descriptorId = buildDescriptorId(descriptor);
    const identityKey = buildDescriptorIdentityKey(descriptor);
    let entry = workingState.descriptors.get(identityKey);

    if (!entry) {
        const matchKey = buildDescriptorMatchKey(descriptor);
        for (const candidate of workingState.descriptors.values()) {
            if (buildDescriptorMatchKey(candidate.descriptor) === matchKey) {
                entry = candidate;
                break;
            }
        }
    }

    let profile = descriptor.analysisProfileId ?? defaultProfile;

    if (entry) {
        descriptor = entry.descriptor;
        descriptorId = entry.id;
        profile = entry.profile ?? descriptor.analysisProfileId ?? profile;
    } else if (upsertDescriptorEntry(workingState, { descriptor, id: descriptorId, profile })) {
        publishNeeded = true;
    }

    if (publishNeeded) {
        publishIfNeeded(element, workingState, identity);
    }

    const sample = sampleFeatureFrame(normalizedTrackId, descriptor, time, samplingOptions ?? undefined);
    if (!sample) {
        return null;
    }

    return {
        values: sample.values,
        metadata: {
            descriptor,
            frame: sample,
            channels: Math.max(1, sample.channels || sample.channelValues?.length || 0),
            channelAliases: sample.channelAliases ?? sample.channelLayout?.aliases ?? null,
            channelLayout: sample.channelLayout ?? null,
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
    profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null
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
            profileRegistryDelta: null,
        };
        elementStates.set(element as object, state);
        publishNeeded = true;
    } else if (state.trackId !== normalizedTrackId) {
        state.trackId = normalizedTrackId;
        state.descriptors.clear();
        state.profileRegistryDelta = null;
        publishNeeded = true;
    }

    const workingState = state!;
    workingState.profileRegistryDelta = profileRegistryDelta ?? null;

    const requiredKeys = new Set<string>();
    for (const descriptor of descriptors) {
        if (!descriptor || !descriptor.featureKey) {
            continue;
        }
        const entryProfile = descriptor.analysisProfileId ?? profile ?? null;
        const entry: DescriptorEntry = {
            descriptor,
            id: buildDescriptorId(descriptor),
            profile: entryProfile,
        };
        requiredKeys.add(buildDescriptorIdentityKey(descriptor));
        if (upsertDescriptorEntry(workingState, entry)) {
            publishNeeded = true;
        }
    }

    for (const key of Array.from(workingState.descriptors.keys())) {
        if (!requiredKeys.has(key)) {
            workingState.descriptors.delete(key);
            publishNeeded = true;
        }
    }

    if (!workingState.descriptors.size) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    if (publishNeeded) {
        const identity = resolveElementIdentity(element);
        publishIfNeeded(element, workingState, identity);
    }
}

/**
 * Retrieve the descriptors currently associated with the element.
 *
 * Useful for diagnostics tooling and unit tests that need to assert which subscriptions were
 * published.
 */
export function getElementSubscriptionSnapshot(
    element: SceneFeatureElementRef | object
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
export function clearFeatureData(element: SceneFeatureElementRef | object, trackId?: string | null): void {
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
