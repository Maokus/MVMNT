import type { AudioFeatureDemand } from '../../../packages/plugin-sdk/src/audio';
import { createFeatureDescriptor } from './descriptorBuilder';
import { clearAnalysisIntent, publishAnalysisIntent } from './analysisIntents';

export interface DeclarativeDemandElement {
    id: string | null;
    type?: string;
}

const activeDemandKeys = new WeakMap<object, Set<string>>();

function normalizedId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function demandIntentId(elementId: string, requestId: string): string {
    return `${elementId}::audio-feature::${requestId}`;
}

/** Atomically replaces one runtime instance's complete declarative demand set. */
export function syncDeclarativeAudioFeatureDemands(
    element: DeclarativeDemandElement & object,
    demands: readonly AudioFeatureDemand[]
): void {
    const elementId = normalizedId(element.id);
    const elementType = normalizedId(element.type) ?? 'unknown';
    const previous = activeDemandKeys.get(element) ?? new Set<string>();
    const next = new Set<string>();

    if (elementId) {
        for (const demand of demands) {
            const requestId = normalizedId(demand?.id);
            const trackId = normalizedId(demand?.trackId);
            if (!requestId || !trackId || !normalizedId(demand?.feature)) continue;
            const intentId = demandIntentId(elementId, requestId);
            const built = createFeatureDescriptor({
                feature: demand.feature,
                bandIndex: demand.bandIndex,
                calculatorId: demand.calculatorId,
                profile: demand.profile,
                profileParams: demand.profileParams,
            });
            next.add(intentId);
            publishAnalysisIntent(intentId, elementType, trackId, [built.descriptor], {
                profile: built.profile,
                profileRegistryDelta: built.profileRegistryDelta,
                ownerElementId: elementId,
                requestId,
                declarative: true,
            });
        }
    }

    for (const intentId of previous) {
        if (!next.has(intentId)) clearAnalysisIntent(intentId);
    }
    activeDemandKeys.set(element, next);
}

export function clearDeclarativeAudioFeatureDemands(element: object): void {
    for (const intentId of activeDemandKeys.get(element) ?? []) clearAnalysisIntent(intentId);
    activeDemandKeys.delete(element);
}
