import type {
    AudioFeatureAnalysisProfileDescriptor,
    AudioFeatureDescriptor,
    AudioSamplingOptions,
    ChannelLayoutMeta,
} from './audioFeatureTypes';
import {
    getFeatureSubscriptionController,
    normalizeTrackId,
    peekFeatureSubscriptionController,
    releaseFeatureSubscriptionController,
    resetFeatureSubscriptionControllersForTests,
    type SceneFeatureElementRef,
} from './featureSubscriptionController';
import {
    createFeatureDescriptor,
    type FeatureDescriptorBuildResult,
    type FeatureDescriptorBuilderOptions,
} from './descriptorBuilder';
import { sampleFeatureFrame } from '@audio/audioFeatureUtils';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

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

export interface ElementSubscriptionSnapshot {
    trackId: string;
    descriptor: AudioFeatureDescriptor;
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
    const builtDescriptor = buildDescriptor(feature);
    const controller = getFeatureSubscriptionController(element);
    const normalizedTrackId = controller.updateTrack(trackId);

    if (!normalizedTrackId) {
        controller.clear();
        releaseFeatureSubscriptionController(element);
        return null;
    }

    const descriptor = controller.resolveDescriptorForSampling(
        builtDescriptor.descriptor,
        builtDescriptor.descriptor.analysisProfileId ?? builtDescriptor.profile ?? null
    );

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
    const controller = getFeatureSubscriptionController(element);
    const normalizedTrackId = controller.updateTrack(trackId);
    if (!normalizedTrackId || descriptors.length === 0) {
        clearFeatureData(element, trackId);
        return;
    }

    controller.syncExplicitDescriptors(descriptors, profile ?? null, profileRegistryDelta ?? null);
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
    const controller = peekFeatureSubscriptionController(element);
    if (!controller) {
        return [];
    }
    const trackId = controller.getActiveTrackId();
    if (!trackId) {
        return [];
    }
    return controller.getSubscriptionSnapshot().map((descriptor) => ({
        trackId,
        descriptor,
    }));
}

/**
 * Remove cached subscription state for an element and clear any published intents.
 */
export function clearFeatureData(element: SceneFeatureElementRef | object, trackId?: string | null): void {
    const controller = peekFeatureSubscriptionController(element);
    if (!controller) {
        return;
    }
    const normalized = normalizeTrackId(trackId ?? null);
    const activeTrack = controller.getActiveTrackId();
    if (normalized && activeTrack && normalized !== activeTrack) {
        return;
    }
    controller.clear(normalized);
    releaseFeatureSubscriptionController(element);
}

/**
 * Reset the internal element state map.
 *
 * Intended for test environments.
 */
export function resetSceneFeatureStateForTests(): void {
    resetFeatureSubscriptionControllersForTests();
}

export type { SceneFeatureElementRef };
