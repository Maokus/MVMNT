import type { PropertyBinding } from '@bindings/property-bindings';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioFeatureDescriptor, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineTrack } from '@state/timelineStore';

type TimelineTrackEntry = TimelineTrack | AudioTrack;

type DescriptorFallback = { featureKey: string; smoothing?: number | null; channelAlias?: string | null };

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
        channelIndex: input?.channelIndex ?? null,
        channelAlias: input?.channelAlias ?? fallback.channelAlias ?? null,
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
): string {
    const band = descriptor.bandIndex != null ? `b${descriptor.bandIndex}` : 'b*';
    const channel = descriptor.channelIndex != null ? `c${descriptor.channelIndex}` : 'c*';
    const alias = descriptor.channelAlias ? `a${descriptor.channelAlias}` : 'a*';
    const smoothing = descriptor.smoothing != null ? `s${descriptor.smoothing}` : 's0';
    const calculator = descriptor.calculatorId ? `calc:${descriptor.calculatorId}` : '';
    return `${tick}:${descriptor.featureKey}:${band}:${channel}:${alias}:${smoothing}:${calculator}`;
}

function resolveChannelIndexFromDescriptor(
    descriptor: AudioFeatureDescriptor,
    track: AudioFeatureTrack,
    cacheAliases: string[] | undefined,
): number | null {
    if (descriptor.channelIndex != null) {
        return descriptor.channelIndex;
    }
    const alias = descriptor.channelAlias?.trim();
    if (!alias) {
        return null;
    }
    const normalized = alias.toLowerCase();
    const trackAliases = track.channelAliases ?? undefined;
    if (trackAliases?.length) {
        const index = trackAliases.findIndex((entry: string | undefined) => entry?.toLowerCase() === normalized);
        if (index >= 0) {
            return index;
        }
    }
    if (cacheAliases?.length) {
        const index = cacheAliases.findIndex((entry: string | undefined) => entry?.toLowerCase() === normalized);
        if (index >= 0) {
            return index;
        }
    }
    return null;
}

export function resolveDescriptorChannelIndex(
    trackId: string | null,
    descriptor: AudioFeatureDescriptor,
): number | null {
    if (!trackId) {
        return descriptor.channelIndex ?? null;
    }
    const context = resolveFeatureContext(trackId, descriptor.featureKey);
    if (!context) {
        return descriptor.channelIndex ?? null;
    }
    return resolveChannelIndexFromDescriptor(
        descriptor,
        context.featureTrack,
        context.cache.channelAliases ?? undefined,
    );
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
    const channelIndex = resolveChannelIndexFromDescriptor(
        descriptor,
        featureTrack,
        cache.channelAliases ?? undefined,
    );
    const cacheKey = buildSampleCacheKey(tick, {
        ...descriptor,
        channelIndex: channelIndex ?? descriptor.channelIndex ?? null,
    });
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
            channelIndex: channelIndex ?? descriptor.channelIndex ?? undefined,
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
