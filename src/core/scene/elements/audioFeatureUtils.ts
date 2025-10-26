import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame } from '@audio/features/tempoAlignedViewAdapter';
import type {
    AudioFeatureDescriptor,
    AudioFeatureTrack,
    AudioSamplingOptions,
} from '@audio/features/audioFeatureTypes';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineTrack } from '@state/timelineStore';
import type { ChannelLayoutMeta } from '@audio/features/audioFeatureTypes';

type TimelineTrackEntry = TimelineTrack | AudioTrack;

type SamplingCache = Map<string, AudioFeatureFrameSample | null>;

const featureSampleCache = new WeakMap<AudioFeatureTrack, Map<string, SamplingCache>>();
const MAX_FEATURE_CACHE_ENTRIES = 128;

export type ChannelSelector = number | string | { index?: number | null; alias?: string | null };

export interface ChannelSampleSelection {
    values: number[];
    channelIndex: number;
    channelCount: number;
    alias?: string | null;
    channelAliases?: string[] | null;
    channelLayout?: ChannelLayoutMeta | null;
}

export function normalizeChannelSelectorInput(value: unknown): string | number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed.length) {
            return null;
        }
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
        return trimmed;
    }
    return null;
}

function resolveSemanticChannelIndex(
    token: string,
    semantics: ChannelLayoutMeta['semantics'] | undefined,
    channelCount: number,
): number | null {
    const normalized = token.trim().toLowerCase();
    if (!normalized.length) {
        return null;
    }
    switch (semantics) {
        case 'mono':
            return 0;
        case 'stereo':
            if (normalized === 'l' || normalized === 'left') {
                return 0;
            }
            if (normalized === 'r' || normalized === 'right') {
                return Math.min(1, Math.max(0, channelCount - 1));
            }
            break;
        case 'mid-side':
            if (normalized === 'mid') {
                return 0;
            }
            if (normalized === 'side') {
                return Math.min(1, Math.max(0, channelCount - 1));
            }
            break;
        default:
            break;
    }
    return null;
}

function resolveChannelIndex(
    selector: ChannelSelector | null | undefined,
    aliases: (string | null | undefined)[] | null | undefined,
    layout: ChannelLayoutMeta | null | undefined,
    channelCount: number,
): number {
    if (selector != null) {
        if (typeof selector === 'number' && Number.isFinite(selector)) {
            const clamped = Math.max(0, Math.floor(selector));
            return Math.min(clamped, Math.max(0, channelCount - 1));
        }
        if (typeof selector === 'string') {
            const trimmed = selector.trim();
            if (trimmed.length) {
                const normalized = trimmed.toLowerCase();
                const aliasList = aliases?.map((alias) => alias?.toLowerCase?.() ?? '') ?? [];
                const aliasIndex = aliasList.findIndex((alias) => alias === normalized);
                if (aliasIndex >= 0) {
                    return Math.min(Math.max(aliasIndex, 0), Math.max(0, channelCount - 1));
                }
                const semanticIndex = resolveSemanticChannelIndex(normalized, layout?.semantics, channelCount);
                if (semanticIndex != null) {
                    return semanticIndex;
                }
                const numeric = Number(trimmed);
                if (Number.isFinite(numeric)) {
                    const clamped = Math.max(0, Math.floor(numeric));
                    return Math.min(clamped, Math.max(0, channelCount - 1));
                }
            }
        } else if (typeof selector === 'object') {
            const index = typeof selector.index === 'number' ? selector.index : undefined;
            if (index != null && Number.isFinite(index)) {
                const clamped = Math.max(0, Math.floor(index));
                return Math.min(clamped, Math.max(0, channelCount - 1));
            }
            const alias = typeof selector.alias === 'string' ? selector.alias.trim() : '';
            if (alias.length) {
                const normalized = alias.toLowerCase();
                const aliasList = aliases?.map((entry) => entry?.toLowerCase?.() ?? '') ?? [];
                const aliasIndex = aliasList.findIndex((entry) => entry === normalized);
                if (aliasIndex >= 0) {
                    return Math.min(Math.max(aliasIndex, 0), Math.max(0, channelCount - 1));
                }
                const semanticIndex = resolveSemanticChannelIndex(normalized, layout?.semantics, channelCount);
                if (semanticIndex != null) {
                    return semanticIndex;
                }
            }
        }
    }
    return 0;
}

export function selectChannelSample(
    sample: AudioFeatureFrameSample | null | undefined,
    selector?: ChannelSelector | null,
): ChannelSampleSelection | null {
    if (!sample) {
        return null;
    }
    const aliasSource = sample.channelAliases ?? sample.channelLayout?.aliases ?? null;
    const layout = sample.channelLayout ?? null;
    const fallbackChannels = Math.max(1, sample.channels || aliasSource?.length || 0);
    const channelValues =
        Array.isArray(sample.channelValues) && sample.channelValues.length > 0
            ? sample.channelValues
            : [Array.isArray(sample.values) ? [...sample.values] : []];
    const channelCount = channelValues.length || fallbackChannels;
    const index = resolveChannelIndex(selector ?? null, aliasSource, layout, channelCount);
    const resolvedIndex = Math.min(Math.max(index, 0), Math.max(0, channelCount - 1));
    const selectedValues = channelValues[resolvedIndex] ? [...channelValues[resolvedIndex]] : [];
    const alias = aliasSource && aliasSource[resolvedIndex] != null ? aliasSource[resolvedIndex] : null;

    return {
        values: selectedValues,
        channelIndex: resolvedIndex,
        channelCount,
        alias: alias ?? null,
        channelAliases: aliasSource ?? null,
        channelLayout: layout,
    };
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

function buildSampleCacheKey(tick: number, descriptor: AudioFeatureDescriptor): string {
    const band = descriptor.bandIndex != null ? `b${descriptor.bandIndex}` : 'b*';
    return `${tick}:${descriptor.featureKey}:${band}`;
}

function buildSamplingOptionsKey(options?: AudioSamplingOptions | null): string {
    if (!options) {
        return 'default';
    }
    const smoothing = Number.isFinite(options.smoothing)
        ? Math.max(0, Math.floor(options.smoothing ?? 0))
        : 0;
    const interpolation = options.interpolation ?? 'linear';
    return `smooth:${smoothing}|interp:${interpolation}`;
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
    samplingOptions?: AudioSamplingOptions | null,
): AudioFeatureFrameSample | null {
    const state = useTimelineStore.getState();
    const context = resolveFeatureContext(trackId, descriptor.featureKey);
    if (!context) {
        return null;
    }
    const { featureTrack } = context;
    const tm = getSharedTimingManager();
    const tick = tm.secondsToTicks(Math.max(0, targetTime));
    const cacheKey = buildSampleCacheKey(tick, descriptor);
    let trackCache = featureSampleCache.get(featureTrack);
    if (!trackCache) {
        trackCache = new Map();
        featureSampleCache.set(featureTrack, trackCache);
    }
    let samplingCache = trackCache.get(cacheKey);
    if (!samplingCache) {
        samplingCache = new Map();
        trackCache.set(cacheKey, samplingCache);
    }
    const samplingKey = buildSamplingOptionsKey(samplingOptions);
    if (samplingCache.has(samplingKey)) {
        return samplingCache.get(samplingKey) ?? null;
    }
    const { sample, diagnostics } = getTempoAlignedFrame(state, {
        trackId,
        featureKey: descriptor.featureKey,
        tick,
        options: {
            bandIndex: descriptor.bandIndex ?? undefined,
            smoothing: samplingOptions?.smoothing ?? undefined,
            interpolation:
                samplingOptions?.interpolation === 'nearest'
                    ? 'hold'
                    : samplingOptions?.interpolation === 'cubic'
                    ? 'spline'
                    : samplingOptions?.interpolation,
        },
    });
    if (diagnostics) {
        recordDiagnostics(diagnostics, trackId);
    }
    const resolved = sample ?? null;
    samplingCache.set(samplingKey, resolved);
    if (trackCache.size > MAX_FEATURE_CACHE_ENTRIES) {
        trackCache.clear();
        const nextSamplingCache = new Map<string, AudioFeatureFrameSample | null>();
        if (resolved !== undefined) {
            nextSamplingCache.set(samplingKey, resolved);
        }
        trackCache.set(cacheKey, nextSamplingCache);
    }
    return resolved;
}
