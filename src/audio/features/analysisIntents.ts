import type { AudioFeatureDescriptor } from './audioFeatureTypes';

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
}

export type AnalysisIntentEvent =
    | { type: 'publish'; intent: AnalysisIntent }
    | { type: 'clear'; elementId: string };

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

export function buildDescriptorId(descriptor: AudioFeatureDescriptor): string {
    const parts: string[] = [];
    parts.push(`feature:${descriptor?.featureKey ?? 'unknown'}`);
    if (descriptor?.calculatorId) parts.push(`calc:${descriptor.calculatorId}`);
    if (descriptor?.bandIndex != null) parts.push(`band:${descriptor.bandIndex}`);
    if (descriptor?.channel != null) {
        if (typeof descriptor.channel === 'number') {
            parts.push(`chan:${descriptor.channel}`);
        } else {
            const alias = descriptor.channel.trim();
            parts.push(`alias:${alias}`);
        }
    }
    if (descriptor?.smoothing != null) parts.push(`smooth:${descriptor.smoothing}`);
    return parts.join('|');
}

export function buildDescriptorMatchKey(descriptor: AudioFeatureDescriptor): string {
    const parts: string[] = [];
    parts.push(`feature:${descriptor?.featureKey ?? 'unknown'}`);
    if (descriptor?.calculatorId) parts.push(`calc:${descriptor.calculatorId}`);
    if (descriptor?.channel != null) {
        if (typeof descriptor.channel === 'number') {
            parts.push(`chan:${descriptor.channel}`);
        } else {
            const alias = descriptor.channel.trim();
            parts.push(`alias:${alias}`);
        }
    }
    if (descriptor?.bandIndex != null) parts.push(`band:${descriptor.bandIndex}`);
    return parts.join('|');
}

function hashIntentPayload(intent: Omit<AnalysisIntent, 'requestedAt'>): string {
    const descriptors = [...intent.descriptors]
        .map((entry) => `${entry.id}:${entry.matchKey}`)
        .sort()
        .join(';');
    return `${intent.elementType}|${intent.trackRef}|${intent.analysisProfileId ?? 'null'}|${descriptors}`;
}

export function publishAnalysisIntent(
    elementId: string | null | undefined,
    elementType: string,
    trackRef: string | null,
    analysisProfileId: string | null,
    descriptors: (AudioFeatureDescriptor | null | undefined)[],
): void {
    if (!elementId) {
        return;
    }
    if (!trackRef || !descriptors.length) {
        lastIntentHashes.delete(elementId);
        bus.clear(elementId);
        return;
    }
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
        analysisProfileId,
        descriptors: descriptorEntries,
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
    if (descriptor.channel != null) {
        const channelLabel =
            typeof descriptor.channel === 'number'
                ? `channel ${descriptor.channel}`
                : `channel ${descriptor.channel}`;
        parts.push(channelLabel);
    }
    if (descriptor.bandIndex != null) {
        parts.push(`band ${descriptor.bandIndex}`);
    }
    if (descriptor.smoothing != null) {
        parts.push(`smooth ${descriptor.smoothing}`);
    }
    return parts.join(' · ');
}

export function formatAnalysisIntentDescriptorId(descriptor: AudioFeatureDescriptor | null | undefined): string {
    return buildDescriptorId(descriptor ?? {} as AudioFeatureDescriptor);
}
