import type { AudioFeatureAnalysisProfileDescriptor, AudioFeatureDescriptor } from './audioFeatureTypes';
import { getDefaultProfile } from './audioFeatureRegistry';
import { DEFAULT_ANALYSIS_PROFILE_ID } from './featureTrackIdentity';

export interface AnalysisIntentDescriptor {
    id: string;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
}

export interface AnalysisIntent {
    elementId: string;
    elementType: string;
    trackRef: string;
    analysisProfileId: string | null;
    descriptors: AnalysisIntentDescriptor[];
    requestedAt: string;
    profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

export type AnalysisIntentEvent = { type: 'publish'; intent: AnalysisIntent } | { type: 'clear'; elementId: string };

type AnalysisIntentListener = (event: AnalysisIntentEvent) => void;

class AnalysisIntentBus {
    private listeners = new Set<AnalysisIntentListener>();

    subscribe(listener: AnalysisIntentListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    publish(intent: AnalysisIntent) {
        for (const listener of this.listeners) {
            listener({ type: 'publish', intent });
        }
    }

    clear(elementId: string) {
        for (const listener of this.listeners) {
            listener({ type: 'clear', elementId });
        }
    }
}

const bus = new AnalysisIntentBus();

const lastIntentHashes = new Map<string, string>();

type DescriptorList = (AudioFeatureDescriptor | null | undefined)[];

export interface PublishAnalysisIntentOptions {
    profile?: string | null;
    profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

function stableStringify(value: unknown): string {
    if (value == null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value.toString() : JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashRegistryDelta(delta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null | undefined): string {
    if (!delta || !Object.keys(delta).length) {
        return 'null';
    }
    const parts = Object.keys(delta)
        .sort()
        .map((key) => `${key}:${stableStringify(delta[key])}`);
    return parts.join('|');
}

export function buildDescriptorId(descriptor: AudioFeatureDescriptor): string {
    const parts: string[] = [];
    parts.push(`feature:${descriptor?.featureKey ?? 'unknown'}`);
    if (descriptor?.calculatorId) parts.push(`calc:${descriptor.calculatorId}`);
    if (descriptor?.bandIndex != null) parts.push(`band:${descriptor.bandIndex}`);
    return `id:${parts.join('|')}`;
}

export function buildDescriptorMatchKey(descriptor: AudioFeatureDescriptor): string {
    const parts: string[] = [];
    parts.push(`feature:${descriptor?.featureKey ?? 'unknown'}`);
    if (descriptor?.calculatorId) parts.push(`calc:${descriptor.calculatorId}`);
    if (descriptor?.bandIndex != null) parts.push(`band:${descriptor.bandIndex}`);
    return `match:${parts.join('|')}`;
}

export function buildDescriptorIdentityKey(descriptor: AudioFeatureDescriptor): string {
    const base = buildDescriptorMatchKey(descriptor);
    const profileComponent =
        descriptor?.profileOverridesHash ??
        descriptor?.analysisProfileId ??
        descriptor?.requestedAnalysisProfileId ??
        null;
    if (!profileComponent || profileComponent === DEFAULT_ANALYSIS_PROFILE_ID) {
        return base;
    }
    return `${base}|profile:${profileComponent}`;
}

function hashIntentPayload(intent: Omit<AnalysisIntent, 'requestedAt'>): string {
    const descriptors = [...intent.descriptors]
        .map((entry) => `${entry.id}:${buildDescriptorIdentityKey(entry.descriptor)}`)
        .sort()
        .join(';');
    const registrySignature = hashRegistryDelta(intent.profileRegistryDelta ?? null);
    return `${intent.elementType}|${intent.trackRef}|${
        intent.analysisProfileId ?? 'null'
    }|${descriptors}|${registrySignature}`;
}

export function publishAnalysisIntent(
    elementId: string | null | undefined,
    elementType: string,
    trackRef: string | null,
    descriptors: DescriptorList,
    options?: PublishAnalysisIntentOptions
): void;
export function publishAnalysisIntent(
    elementId: string | null | undefined,
    elementType: string,
    trackRef: string | null,
    profile: string | null,
    descriptors: DescriptorList
): void;
export function publishAnalysisIntent(
    elementId: string | null | undefined,
    elementType: string,
    trackRef: string | null,
    descriptorsOrProfile: DescriptorList | string | null | undefined,
    maybeOptionsOrDescriptors?: PublishAnalysisIntentOptions | DescriptorList
): void {
    if (!elementId) {
        if (process.env.NODE_ENV !== 'production') {
            const descriptorCount = Array.isArray(descriptorsOrProfile)
                ? descriptorsOrProfile.filter(Boolean).length
                : Array.isArray(maybeOptionsOrDescriptors)
                ? (maybeOptionsOrDescriptors as DescriptorList).filter(Boolean).length
                : 0;
            console.warn(
                `[analysisIntents] Dropping publish for element type "${elementType}" because elementId is missing`,
                {
                    trackRef: trackRef ?? null,
                    descriptors: descriptorCount,
                }
            );
        }
        return;
    }
    let descriptors: DescriptorList = [];
    let options: PublishAnalysisIntentOptions | undefined;
    const legacySignature =
        !Array.isArray(descriptorsOrProfile) &&
        (typeof descriptorsOrProfile === 'string' || descriptorsOrProfile == null) &&
        Array.isArray(maybeOptionsOrDescriptors);

    if (legacySignature) {
        descriptors = (maybeOptionsOrDescriptors ?? []) as DescriptorList;
        options = { profile: descriptorsOrProfile ?? undefined };
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                '[analysisIntents] publishAnalysisIntent(elementId, type, trackRef, profile, descriptors) is deprecated. ' +
                    'Pass descriptors as the fourth argument and provide the profile via options.profile.'
            );
        }
    } else {
        descriptors = (descriptorsOrProfile ?? []) as DescriptorList;
        options = (maybeOptionsOrDescriptors as PublishAnalysisIntentOptions | undefined) ?? undefined;
    }

    if (!trackRef || !descriptors.length) {
        lastIntentHashes.delete(elementId);
        bus.clear(elementId);
        return;
    }
    const resolvedProfile =
        typeof options?.profile === 'string' && options.profile.trim().length > 0
            ? options.profile.trim()
            : getDefaultProfile();
    const descriptorEntries: AnalysisIntentDescriptor[] = [];
    for (const descriptor of descriptors) {
        if (!descriptor || !descriptor.featureKey) continue;
        const id = buildDescriptorId(descriptor);
        const matchKey = buildDescriptorMatchKey(descriptor);
        descriptorEntries.push({ id, descriptor, matchKey });
    }
    if (!descriptorEntries.length) {
        lastIntentHashes.delete(elementId);
        bus.clear(elementId);
        return;
    }
    const payload: Omit<AnalysisIntent, 'requestedAt'> = {
        elementId,
        elementType,
        trackRef,
        analysisProfileId: resolvedProfile,
        descriptors: descriptorEntries,
        profileRegistryDelta: options?.profileRegistryDelta ?? null,
    };
    const fingerprint = hashIntentPayload(payload);
    if (lastIntentHashes.get(elementId) === fingerprint) {
        return;
    }
    lastIntentHashes.set(elementId, fingerprint);
    bus.publish({ ...payload, requestedAt: new Date().toISOString() });
}

export function clearAnalysisIntent(elementId: string | null | undefined): void {
    if (!elementId) {
        return;
    }
    lastIntentHashes.delete(elementId);
    bus.clear(elementId);
}

export function subscribeToAnalysisIntents(listener: AnalysisIntentListener): () => void {
    return bus.subscribe(listener);
}

export function resetAnalysisIntentStateForTests(): void {
    lastIntentHashes.clear();
}

export function buildDescriptorLabel(descriptor: AudioFeatureDescriptor | null | undefined): string {
    if (!descriptor) {
        return 'Unknown descriptor';
    }
    const parts: string[] = [];
    parts.push(descriptor.featureKey ?? 'unknown');
    if (descriptor.bandIndex != null) {
        parts.push(`band ${descriptor.bandIndex}`);
    }
    return parts.join(' · ');
}

export function formatAnalysisIntentDescriptorId(descriptor: AudioFeatureDescriptor | null | undefined): string {
    return buildDescriptorId(descriptor ?? ({} as AudioFeatureDescriptor));
}
