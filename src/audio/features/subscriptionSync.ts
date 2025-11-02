import { buildDescriptorIdentityKey } from './analysisIntents';
import { createFeatureDescriptor } from './descriptorBuilder';
import {
    clearFeatureData,
    getElementSubscriptionSnapshot,
    syncElementFeatureIntents,
    type ElementSubscriptionSnapshot,
    type SceneFeatureElementRef,
} from './sceneApi';
import type { AudioFeatureAnalysisProfileDescriptor, AudioFeatureDescriptor } from './audioFeatureTypes';
import type { AudioFeatureRequirement } from '@core/scene/elements/audioElementMetadata';

function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') {
        return null;
    }
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function dedupeDescriptors(
    descriptors: {
        descriptor: AudioFeatureDescriptor;
        profile: string | null;
        profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
    }[]
): {
    descriptors: AudioFeatureDescriptor[];
    profile: string | null;
    profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
} {
    const map = new Map<string, AudioFeatureDescriptor>();
    let profile: string | null = null;
    const registryAggregate: Record<string, AudioFeatureAnalysisProfileDescriptor> = {};
    let hasRegistryDelta = false;

    for (const entry of descriptors) {
        const key = buildDescriptorIdentityKey(entry.descriptor);
        const existing = map.get(key);
        if (!existing) {
            const descriptor = entry.descriptor;
            map.set(key, descriptor);
            if (!profile && entry.profile) {
                profile = entry.profile;
            }
            if (descriptor.profileRegistryDelta) {
                for (const [id, delta] of Object.entries(descriptor.profileRegistryDelta)) {
                    if (!registryAggregate[id]) {
                        registryAggregate[id] = { ...delta };
                        hasRegistryDelta = true;
                    }
                }
            }
            continue;
        }

        if (!profile && entry.profile) {
            profile = entry.profile;
        }

        if (entry.descriptor.profileOverrides && !existing.profileOverrides) {
            existing.profileOverrides = { ...entry.descriptor.profileOverrides };
            existing.profileOverridesHash =
                entry.descriptor.profileOverridesHash ?? existing.profileOverridesHash ?? null;
        }

        if (!existing.analysisProfileId && entry.descriptor.analysisProfileId) {
            existing.analysisProfileId = entry.descriptor.analysisProfileId;
        }

        if (!existing.requestedAnalysisProfileId && entry.descriptor.requestedAnalysisProfileId) {
            existing.requestedAnalysisProfileId = entry.descriptor.requestedAnalysisProfileId;
        }

        if (entry.descriptor.profileRegistryDelta) {
            existing.profileRegistryDelta = {
                ...(existing.profileRegistryDelta ?? {}),
                ...entry.descriptor.profileRegistryDelta,
            };
            for (const [id, delta] of Object.entries(entry.descriptor.profileRegistryDelta)) {
                if (!registryAggregate[id]) {
                    registryAggregate[id] = { ...delta };
                    hasRegistryDelta = true;
                }
            }
        }
    }

    return {
        descriptors: Array.from(map.values()),
        profile,
        profileRegistryDelta: hasRegistryDelta ? registryAggregate : null,
    };
}

export function syncElementSubscriptions(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    requirements: AudioFeatureRequirement[]
): void {
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!normalizedTrackId || requirements.length === 0) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    const built = requirements.map((requirement) =>
        createFeatureDescriptor({
            feature: requirement.feature,
            bandIndex: requirement.bandIndex ?? undefined,
            calculatorId: requirement.calculatorId ?? undefined,
            profile: requirement.profile ?? undefined,
            profileParams: requirement.profileParams ?? undefined,
        })
    );
    const { descriptors, profile, profileRegistryDelta } = dedupeDescriptors(built);

    if (!descriptors.length) {
        clearFeatureData(element, normalizedTrackId);
        return;
    }

    syncElementFeatureIntents(
        element,
        normalizedTrackId,
        descriptors,
        profile ?? undefined,
        profileRegistryDelta ?? undefined
    );
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
