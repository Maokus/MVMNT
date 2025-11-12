import { buildDescriptorIdentityKey } from './analysisIntents';
import {
    getElementSubscriptionSnapshot,
    type ElementSubscriptionSnapshot,
    type SceneFeatureElementRef,
} from './sceneApi';
import { getFeatureSubscriptionController, normalizeTrackId } from './featureSubscriptionController';
import type { AudioFeatureDescriptor } from './audioFeatureTypes';
import type { AudioFeatureRequirement } from '@audio/audioElementMetadata';

export function syncElementSubscriptions(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    requirements: AudioFeatureRequirement[]
): void {
    const controller = getFeatureSubscriptionController(element);
    controller.setStaticRequirements(requirements);
    controller.updateTrack(trackId);
}

export function getElementSubscriptions(
    element: SceneFeatureElementRef | object
): Array<[string, AudioFeatureDescriptor]> {
    return getElementSubscriptionSnapshot(element).map((entry) => [entry.trackId, entry.descriptor]);
}

export function hasSubscription(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    descriptor: AudioFeatureDescriptor
): boolean {
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!normalizedTrackId) {
        return false;
    }
    const identityKey = buildDescriptorIdentityKey(descriptor);
    return getElementSubscriptionSnapshot(element).some(
        (entry) => entry.trackId === normalizedTrackId && buildDescriptorIdentityKey(entry.descriptor) === identityKey
    );
}

export function isInRequirements(
    descriptor: AudioFeatureDescriptor,
    targetDescriptors: AudioFeatureDescriptor[]
): boolean {
    const identityKey = buildDescriptorIdentityKey(descriptor);
    return targetDescriptors.some((entry) => buildDescriptorIdentityKey(entry) === identityKey);
}

export function getElementSubscriptionDetails(element: SceneFeatureElementRef | object): ElementSubscriptionSnapshot[] {
    return getElementSubscriptionSnapshot(element);
}
