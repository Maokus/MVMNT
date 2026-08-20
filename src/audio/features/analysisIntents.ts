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
    /** Scene element that owns this request. Defaults to elementId for legacy publishers. */
    ownerElementId?: string;
    /** Stable request ID within ownerElementId. */
    requestId?: string;
    /** True when the element definition, rather than a sampling call, owns this request. */
    declarative?: boolean;
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
const activeIntents = new Map<string, AnalysisIntent>();

export type PersistedAnalysisIntent = Omit<AnalysisIntent, 'requestedAt'>;

type DescriptorList = (AudioFeatureDescriptor | null | undefined)[];

export interface PublishAnalysisIntentOptions {
    profile?: string | null;
    profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
    /** Re-emit an unchanged intent after its scene runtime has been restored. */
    force?: boolean;
    ownerElementId?: string;
    requestId?: string;
    declarative?: boolean;
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
    return `${intent.ownerElementId ?? intent.elementId}|${intent.requestId ?? 'default'}|${intent.elementType}|${intent.trackRef}|${
        intent.analysisProfileId ?? 'null'
    }|${descriptors}|${registrySignature}`;
}

export function publishAnalysisIntent(
    elementId: string | null | undefined,
    elementType: string,
    trackRef: string | null,
    descriptors: DescriptorList,
    options?: PublishAnalysisIntentOptions
): void {
    if (!elementId) {
        if (process.env.NODE_ENV !== 'production') {
            const descriptorCount = descriptors.filter(Boolean).length;
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
        ownerElementId: options?.ownerElementId ?? elementId,
        requestId: options?.requestId ?? 'default',
        declarative: options?.declarative === true,
        elementType,
        trackRef,
        analysisProfileId: resolvedProfile,
        descriptors: descriptorEntries,
        profileRegistryDelta: options?.profileRegistryDelta ?? null,
    };
    const fingerprint = hashIntentPayload(payload);
    if (!options?.force && lastIntentHashes.get(elementId) === fingerprint) {
        return;
    }
    lastIntentHashes.set(elementId, fingerprint);
    const intent = { ...payload, requestedAt: new Date().toISOString() };
    activeIntents.set(elementId, intent);
    bus.publish(intent);
}

export function clearAnalysisIntent(elementId: string | null | undefined): void {
    if (!elementId) {
        return;
    }
    lastIntentHashes.delete(elementId);
    activeIntents.delete(elementId);
    bus.clear(elementId);
}

export function subscribeToAnalysisIntents(listener: AnalysisIntentListener): () => void {
    const unsubscribe = bus.subscribe(listener);
    for (const intent of activeIntents.values()) listener({ type: 'publish', intent: cloneIntent(intent) });
    return unsubscribe;
}

export function resetAnalysisIntentStateForTests(): void {
    lastIntentHashes.clear();
    activeIntents.clear();
}

function cloneIntent(intent: AnalysisIntent): AnalysisIntent {
    return structuredClone(intent);
}

/** Returns the retained source of truth used by scene persistence. */
export function getAnalysisIntentSnapshot(): PersistedAnalysisIntent[] {
    return [...activeIntents.values()]
        .filter((intent) => !(intent.ownerElementId ?? intent.elementId).startsWith('__feature:'))
        .map(({ requestedAt: _requestedAt, ...intent }) => structuredClone(intent));
}

/** Clears the previous scene's demands before runtime instances are reconciled. */
export function beginAnalysisIntentRestore(): void {
    const ids = [...activeIntents.keys()];
    activeIntents.clear();
    lastIntentHashes.clear();
    for (const id of ids) bus.clear(id);
}

/** Adds persisted demands only for elements that did not publish an authoritative runtime declaration. */
export function mergePersistedAnalysisIntents(snapshot: readonly PersistedAnalysisIntent[] | null | undefined): void {
    if (!Array.isArray(snapshot)) return;
    const runtimeOwners = new Set(
        [...activeIntents.values()].map((intent) => intent.ownerElementId ?? intent.elementId)
    );
    for (const raw of snapshot) {
        if (!raw || typeof raw !== 'object' || !raw.elementId || !raw.trackRef) continue;
        const ownerElementId = raw.ownerElementId ?? raw.elementId;
        if (runtimeOwners.has(ownerElementId) || activeIntents.has(raw.elementId)) continue;
        const intent: AnalysisIntent = {
            ...cloneIntent({ ...raw, requestedAt: new Date().toISOString() }),
            ownerElementId,
        };
        activeIntents.set(intent.elementId, intent);
        lastIntentHashes.set(intent.elementId, hashIntentPayload(raw));
        bus.publish(intent);
    }
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
