import type { PropertyBinding } from '@bindings/property-bindings';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioFeatureDescriptor, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineTrack } from '@state/timelineStore';
import { publishAnalysisIntent, clearAnalysisIntent } from '@audio/features/analysisIntents';
import { resolveChannel, type TrackChannelConfig } from '@audio/features/channelResolution';

type TimelineTrackEntry = TimelineTrack | AudioTrack;

type DescriptorFallback = { featureKey: string; smoothing?: number | null; channel?: number | string | null };

const featureSampleCache = new WeakMap<AudioFeatureTrack, Map<string, AudioFeatureFrameSample | null>>();
const MAX_FEATURE_CACHE_ENTRIES = 128;

export function resolveTimelineTrackRefValue(
    binding: PropertyBinding | undefined,
    fallback: unknown,
): string | null {
    const coerce = (input: unknown): string | null => {
        if (typeof input === 'string') return input || null;
        if (Array.isArray(input)) {
            for (const entry of input) {
                if (typeof entry === 'string' && entry) {
                    return entry;
                }
            }
        }
        return null;
    };
    if (binding) {
        try {
            const value = binding.getValue();
            const resolved = coerce(value);
            if (resolved) return resolved;
        } catch (error) {
            console.warn('[audioFeatureUtils] failed to read track ref binding', error);
        }
    }
    return coerce(fallback);
}

export function coerceFeatureDescriptor(
    input: AudioFeatureDescriptor | null | undefined,
    fallback: DescriptorFallback,
): AudioFeatureDescriptor {
    return {
        featureKey: input?.featureKey ?? fallback.featureKey,
        calculatorId: input?.calculatorId ?? null,
        bandIndex: input?.bandIndex ?? null,
        channel: input?.channel ?? fallback.channel ?? null,
        smoothing: input?.smoothing ?? fallback.smoothing ?? null,
    };
}

export function coerceFeatureDescriptors(
    input: AudioFeatureDescriptor | AudioFeatureDescriptor[] | null | undefined,
    fallback: DescriptorFallback,
): AudioFeatureDescriptor[] {
    if (Array.isArray(input)) {
        const descriptors = input.length ? input : [null];
        return descriptors
            .filter((entry) => entry != null)
            .map((descriptor) => coerceFeatureDescriptor(descriptor, fallback));
    }
    if (input) {
        return [coerceFeatureDescriptor(input, fallback)];
    }
    return [coerceFeatureDescriptor(null, fallback)];
}

export function emitAnalysisIntent(
    element: { id: string | null; type: string },
    trackRef: string | null,
    analysisProfileId: string | null,
    descriptors: AudioFeatureDescriptor[],
): void {
    if (!element?.id) {
        return;
    }
    if (!trackRef || !descriptors.length) {
        clearAnalysisIntent(element.id);
        return;
    }
    publishAnalysisIntent(element.id, element.type, trackRef, analysisProfileId, descriptors);
}

export function resolveFeatureContext(trackId: string | null, featureKey: string | null) {
    if (!trackId || !featureKey) return null;
    const state = useTimelineStore.getState();
    const entry = state.tracks[trackId] as TimelineTrackEntry | undefined;
    if (!entry || entry.type !== 'audio') return null;
    const sourceId = entry.audioSourceId ?? entry.id;
    const cache = state.audioFeatureCaches[sourceId];
    const featureTrack = cache?.featureTracks?.[featureKey];
    if (!featureTrack) return null;
    return { state, track: entry, sourceId, cache, featureTrack } as const;
}

function buildSampleCacheKey(
    tick: number,
    descriptor: AudioFeatureDescriptor,
    resolvedChannel?: number | null,
): string {
    const band = descriptor.bandIndex != null ? `b${descriptor.bandIndex}` : 'b*';
    const channelValue = descriptor.channel;
    const trimmed = typeof channelValue === 'string' ? channelValue.trim() : null;
    const numericChannel =
        typeof channelValue === 'number'
            ? channelValue
            : trimmed && /^-?\d+$/.test(trimmed)
            ? Number(trimmed)
            : resolvedChannel ?? null;
    const alias =
        trimmed && !(numericChannel != null)
            ? `a${trimmed}`
            : 'a*';
    const channel = numericChannel != null ? `c${numericChannel}` : 'c*';
    const smoothing = descriptor.smoothing != null ? `s${descriptor.smoothing}` : 's0';
    const calculator = descriptor.calculatorId ? `calc:${descriptor.calculatorId}` : '';
    return `${tick}:${descriptor.featureKey}:${band}:${channel}:${alias}:${smoothing}:${calculator}`;
}

export function resolveDescriptorChannel(
    trackId: string | null,
    descriptor: AudioFeatureDescriptor,
): number | null {
    if (descriptor.channel == null) {
        return null;
    }
    if (!trackId || typeof descriptor.channel === 'number') {
        return typeof descriptor.channel === 'number' ? descriptor.channel : null;
    }
    const context = resolveFeatureContext(trackId, descriptor.featureKey);
    if (!context) {
        return typeof descriptor.channel === 'number' ? descriptor.channel : null;
    }
    try {
        return resolveChannel(descriptor.channel, {
            track: context.featureTrack,
            cacheAliases: context.cache.channelAliases ?? null,
        });
    } catch (error) {
        console.warn('[audioFeatureUtils] failed to resolve descriptor channel', error);
        return null;
    }
}

function recordDiagnostics(diagnostics: TempoAlignedAdapterDiagnostics, trackId: string) {
    const state = useTimelineStore.getState();
    state.recordTempoAlignedDiagnostics?.(diagnostics.sourceId ?? trackId, diagnostics);
    if (diagnostics.fallbackReason) {
        state.recordHybridCacheFallback?.({
            trackId,
            sourceId: diagnostics.sourceId ?? trackId,
            featureKey: diagnostics.featureKey,
            reason: diagnostics.fallbackReason,
        });
    }
}

export function sampleFeatureFrame(
    trackId: string,
    descriptor: AudioFeatureDescriptor,
    targetTime: number,
): AudioFeatureFrameSample | null {
    const state = useTimelineStore.getState();
    const context = resolveFeatureContext(trackId, descriptor.featureKey);
    if (!context) {
        return null;
    }
    const { cache, featureTrack } = context;
    const tm = getSharedTimingManager();
    const tick = tm.secondsToTicks(Math.max(0, targetTime));
    let channelIndex: number | null = null;
    const channelConfig: TrackChannelConfig = {
        track: featureTrack,
        cacheAliases: cache.channelAliases ?? null,
    };
    if (descriptor.channel != null) {
        try {
            channelIndex = resolveChannel(descriptor.channel, channelConfig);
        } catch (error) {
            console.warn('[audioFeatureUtils] failed to resolve channel for sampling', error);
            return null;
        }
    }
    const cacheKey = buildSampleCacheKey(tick, descriptor, channelIndex);
    let trackCache = featureSampleCache.get(featureTrack);
    if (!trackCache) {
        trackCache = new Map();
        featureSampleCache.set(featureTrack, trackCache);
    }
    if (trackCache.has(cacheKey)) {
        return trackCache.get(cacheKey) ?? null;
    }
    const { sample, diagnostics } = getTempoAlignedFrame(state, {
        trackId,
        featureKey: descriptor.featureKey,
        tick,
        options: {
            bandIndex: descriptor.bandIndex ?? undefined,
            channelIndex: channelIndex ?? undefined,
            smoothing: descriptor.smoothing ?? undefined,
        },
    });
    if (diagnostics) {
        recordDiagnostics(diagnostics, trackId);
    }
    const resolved = sample ?? null;
    trackCache.set(cacheKey, resolved);
    if (trackCache.size > MAX_FEATURE_CACHE_ENTRIES) {
        trackCache.clear();
        trackCache.set(cacheKey, resolved);
    }
    return resolved;
}
