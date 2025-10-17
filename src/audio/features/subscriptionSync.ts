import { buildDescriptorMatchKey } from './analysisIntents';
import { createFeatureDescriptor } from './descriptorBuilder';
import {
    clearFeatureData,
    getElementSubscriptionSnapshot,
    syncElementFeatureIntents,
    type ElementSubscriptionSnapshot,
    type SceneFeatureElementRef,
} from './sceneApi';
import type { AudioFeatureDescriptor } from './audioFeatureTypes';
import type { AudioFeatureRequirement } from '@core/scene/elements/audioElementMetadata';

function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') {
        return null;
    }
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function dedupeDescriptors(
    descriptors: { descriptor: AudioFeatureDescriptor; profile: string | null }[],
): { descriptors: AudioFeatureDescriptor[]; profile: string | null } {
    const map = new Map<string, AudioFeatureDescriptor>();
    let profile: string | null = null;
    for (const entry of descriptors) {
        const key = buildDescriptorMatchKey(entry.descriptor);
        if (!map.has(key)) {
            map.set(key, entry.descriptor);
            if (!profile && entry.profile) {
                profile = entry.profile;
            }
        }
    }
    return { descriptors: Array.from(map.values()), profile };
}

export function syncElementSubscriptions(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    requirements: AudioFeatureRequirement[],
): void {
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!normalizedTrackId || requirements.length === 0) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    const built = requirements.map((requirement) =>
        createFeatureDescriptor({
            feature: requirement.feature,
            channel: requirement.channel ?? undefined,
            bandIndex: requirement.bandIndex ?? undefined,
            calculatorId: requirement.calculatorId ?? undefined,
        }),
    );
    const { descriptors, profile } = dedupeDescriptors(built);

    if (!descriptors.length) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    syncElementFeatureIntents(element, normalizedTrackId, descriptors, profile ?? undefined);
}

export function getElementSubscriptions(
    element: SceneFeatureElementRef | object,
): Array<[string, AudioFeatureDescriptor]> {
    return getElementSubscriptionSnapshot(element).map((entry) => [entry.trackId, entry.descriptor]);
}

export function hasSubscription(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    descriptor: AudioFeatureDescriptor,
): boolean {
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!normalizedTrackId) {
        return false;
    }
    const matchKey = buildDescriptorMatchKey(descriptor);
    return getElementSubscriptionSnapshot(element).some(
        (entry) => entry.trackId === normalizedTrackId && buildDescriptorMatchKey(entry.descriptor) === matchKey,
    );
}

export function isInRequirements(
    descriptor: AudioFeatureDescriptor,
    targetDescriptors: AudioFeatureDescriptor[],
): boolean {
    const matchKey = buildDescriptorMatchKey(descriptor);
    return targetDescriptors.some((entry) => buildDescriptorMatchKey(entry) === matchKey);
}

export function getElementSubscriptionDetails(
    element: SceneFeatureElementRef | object,
): ElementSubscriptionSnapshot[] {
    return getElementSubscriptionSnapshot(element);
}
