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

type TimelineTrackEntry = TimelineTrack | AudioTrack;

type SamplingCache = Map<string, AudioFeatureFrameSample | null>;

const featureSampleCache = new WeakMap<AudioFeatureTrack, Map<string, SamplingCache>>();
const MAX_FEATURE_CACHE_ENTRIES = 128;

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
    const calculator = descriptor.calculatorId ? `calc:${descriptor.calculatorId}` : '';
    return `${tick}:${descriptor.featureKey}:${band}:${calculator}`;
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

export function resolveDescriptorChannel(
    trackId: string | null,
    descriptor: AudioFeatureDescriptor,
): number | null {
    void trackId;
    void descriptor;
    return null;
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
    const { cache, featureTrack } = context;
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
