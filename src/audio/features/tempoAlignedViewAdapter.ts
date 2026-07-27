import { createTempoMapper, type TempoMapper } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import type {
    AudioFeatureCache,
    AudioFeatureTrack,
    AudioFeatureTrackFormat,
    ChannelLayoutMeta,
} from './audioFeatureTypes';
import { parseFeatureTrackKey, resolveFeatureTrackFromCache } from './featureTrackIdentity';
import { normalizeHopTicks, quantizeHopTicks } from './hopQuantization';
import {
    getAudioClipsForTrack,
    getAudioClipTimelineSegments,
    resolveAudioClipAtTick,
} from '@state/timeline/audioClips';
import { createTimingContext } from '@state/timelineTime';
import type { AudioTrack } from '@audio/audioTypes';

type NumericArray = Float32Array | Uint8Array | Int16Array;

const DEFAULT_INTERPOLATION: TempoInterpolationProfile = 'linear';

export type TempoInterpolationProfile = 'hold' | 'linear' | 'spline';

interface FrameVectorInfo {
    flatValues: number[];
    channelValues: number[][];
    channelSizes: number[];
    frameLength?: number;
}

export interface TempoAlignedFrameOptions {
    bandIndex?: number | null;
    smoothing?: number;
    interpolation?: TempoInterpolationProfile;
}

export interface TempoAlignedRangeOptions extends TempoAlignedFrameOptions {
    framePadding?: number;
}

type FrameShapeSource = 'observed' | 'metadata';

interface FrameShape {
    channelSizes: number[];
    flatLength: number;
    frameLength?: number;
    source: FrameShapeSource;
}

type FrameShapeBucket = Map<string, FrameShape>;

const frameShapeRegistry = new WeakMap<AudioFeatureTrack, FrameShapeBucket>();

function getFrameShapeKey(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): string {
    const bandKey = options.bandIndex != null ? 'band' : 'full';
    return `${track.format}:${bandKey}`;
}

function cloneChannelSizes(sizes: number[]): number[] {
    return sizes.map((size) => Math.max(0, Math.floor(size ?? 0)));
}

function createShapeFromVector(info: FrameVectorInfo, source: FrameShapeSource): FrameShape {
    const normalizedChannelSizes = cloneChannelSizes(info.channelSizes ?? []);
    const flatLength = info.flatValues.length;
    const frameLength = typeof info.frameLength === 'number' ? info.frameLength : undefined;
    return {
        channelSizes: normalizedChannelSizes,
        flatLength,
        frameLength: typeof frameLength === 'number' && Number.isFinite(frameLength) ? frameLength : undefined,
        source,
    };
}

function upsertFrameShape(track: AudioFeatureTrack, key: string, shape: FrameShape): FrameShape {
    let bucket = frameShapeRegistry.get(track);
    if (!bucket) {
        bucket = new Map();
        frameShapeRegistry.set(track, bucket);
    }
    const existing = bucket.get(key);
    if (!existing) {
        bucket.set(key, shape);
        return shape;
    }
    if (existing.source === 'observed' && shape.source === 'metadata') {
        return existing;
    }
    if (existing.source === 'metadata' && shape.source === 'observed') {
        bucket.set(key, shape);
        return shape;
    }
    return existing;
}

function recordObservedFrameShape(track: AudioFeatureTrack, options: TempoAlignedFrameOptions, info: FrameVectorInfo) {
    const key = getFrameShapeKey(track, options);
    const shape = createShapeFromVector(info, 'observed');
    upsertFrameShape(track, key, shape);
}

function resolveFrameShape(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): FrameShape | undefined {
    const key = getFrameShapeKey(track, options);
    return frameShapeRegistry.get(track)?.get(key);
}

function deriveMetadataFrameShape(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): FrameShape {
    const format = track.format;
    const isBandSample = options.bandIndex != null && format !== 'waveform-minmax' && format !== 'waveform-periodic';
    if (isBandSample) {
        return {
            channelSizes: [1],
            flatLength: 1,
            frameLength: 1,
            source: 'metadata',
        };
    }
    if (format === 'waveform-minmax') {
        const channels = Math.max(1, Math.floor(track.channels ?? 0) || 1);
        const channelSizes = Array.from({ length: channels }, () => 2);
        return {
            channelSizes,
            flatLength: channelSizes.reduce((total, size) => total + size, 0),
            frameLength: 2,
            source: 'metadata',
        };
    }
    if (format === 'waveform-periodic') {
        const length = Math.max(0, resolvePeriodicWaveformLength(track));
        return {
            channelSizes: [length],
            flatLength: length,
            frameLength: length,
            source: 'metadata',
        };
    }
    const channels = Math.max(1, Math.floor(track.channels ?? 0) || 1);
    const channelSizes = Array.from({ length: channels }, () => 1);
    return {
        channelSizes,
        flatLength: channelSizes.reduce((total, size) => total + size, 0),
        frameLength: channels === 1 ? 1 : undefined,
        source: 'metadata',
    };
}

function ensureFrameShape(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): FrameShape {
    const existing = resolveFrameShape(track, options);
    if (existing && existing.source === 'observed') {
        return existing;
    }
    if (track.frameCount > 0) {
        const observedIndex = Math.max(0, Math.min(track.frameCount - 1, 0));
        const info = buildFrameVectorInfo(track, observedIndex, options);
        const refreshed = resolveFrameShape(track, options);
        if (refreshed) {
            return refreshed;
        }
        const fallbackFromInfo = createShapeFromVector(info, 'metadata');
        const key = getFrameShapeKey(track, options);
        return upsertFrameShape(track, key, fallbackFromInfo);
    }
    const metadataShape = deriveMetadataFrameShape(track, options);
    const key = getFrameShapeKey(track, options);
    return upsertFrameShape(track, key, metadataShape);
}

export interface TempoAlignedAdapterDiagnostics {
    trackId: string;
    sourceId?: string;
    featureKey: string;
    cacheHit: boolean;
    interpolation: TempoInterpolationProfile;
    mapperDurationNs: number;
    frameCount: number;
    requestStartTick: number;
    requestEndTick?: number;
    fallbackReason?: string;
    timestamp: number;
}

export interface TempoAlignedFrameSample {
    frameIndex: number;
    fractionalIndex: number;
    hopTicks: number;
    values: number[];
    channels: number;
    channelValues: number[][];
    channelLayout?: ChannelLayoutMeta | null;
    format: AudioFeatureTrackFormat;
    frameLength?: number;
}

export interface TempoAlignedRangeSample {
    hopTicks: number;
    frameCount: number;
    channels: number;
    format: AudioFeatureTrackFormat;
    data: Float32Array;
    frameTicks: Float64Array;
    frameSeconds?: Float64Array;
    channelLayout?: ChannelLayoutMeta | null;
    requestedStartTick: number;
    requestedEndTick: number;
    windowStartTick: number;
    windowEndTick: number;
    trackStartTick: number;
    trackEndTick: number;
    sourceId: string;
}

export interface TempoAlignedFrameRequest {
    trackId: string;
    featureKey: string;
    tick: number;
    options?: TempoAlignedFrameOptions;
    analysisProfileId?: string | null;
}

export interface TempoAlignedRangeRequest {
    trackId: string;
    featureKey: string;
    startTick: number;
    endTick: number;
    options?: TempoAlignedRangeOptions;
    analysisProfileId?: string | null;
}

export interface TempoAlignedFrameResult {
    sample?: TempoAlignedFrameSample;
    diagnostics: TempoAlignedAdapterDiagnostics;
}

export interface TempoAlignedRangeResult {
    range?: TempoAlignedRangeSample;
    diagnostics: TempoAlignedAdapterDiagnostics;
}

let cachedTempoMapper: TempoMapper | null = null;
let cachedTempoKey = '';

function resolveTempoMapper(state: TimelineState): TempoMapper {
    const tempoMap = state.timeline.masterTempoMap ?? [];
    const bpm = state.timeline.globalBpm || 120;
    const ticksPerQuarter = getSharedTimingManager().ticksPerQuarter;
    const key = `${bpm}:${ticksPerQuarter}:${JSON.stringify(tempoMap)}`;
    if (cachedTempoMapper && cachedTempoKey === key) {
        return cachedTempoMapper;
    }
    cachedTempoMapper = createTempoMapper({
        ticksPerQuarter,
        globalBpm: bpm,
        tempoMap,
    });
    cachedTempoKey = key;
    return cachedTempoMapper;
}

function nowNs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now() * 1_000_000;
    }
    return Date.now() * 1_000_000;
}

function resolveAudioSourceTrack(state: TimelineState, trackId: string) {
    const track = state.tracks[trackId] as AudioTrack | undefined;
    if (!track || track.type !== 'audio') return undefined;
    const sourceId = getAudioClipsForTrack(track)[0]?.sourceId ?? trackId;
    return { track, sourceId } as const;
}

function resolveHopSeconds(track: AudioFeatureTrack, cache: AudioFeatureCache): number {
    return track.hopSeconds || cache.hopSeconds || 0.001;
}

function resolveStartSeconds(track: AudioFeatureTrack, cache: AudioFeatureCache): number {
    if (typeof track.startTimeSeconds === 'number') {
        return track.startTimeSeconds;
    }
    if (typeof cache.startTimeSeconds === 'number') {
        return cache.startTimeSeconds;
    }
    return 0;
}

function resolveHopTicks(track: AudioFeatureTrack, cache: AudioFeatureCache, tempoMapper: TempoMapper): number {
    const direct = normalizeHopTicks(track.hopTicks);
    if (direct != null) {
        return direct;
    }
    const cacheHop = normalizeHopTicks(cache.hopTicks);
    if (cacheHop != null) {
        return cacheHop;
    }
    const projection =
        normalizeHopTicks(track.tempoProjection?.hopTicks) != null ? track.tempoProjection : cache.tempoProjection;
    const hopSeconds = resolveHopSeconds(track, cache);
    return quantizeHopTicks({
        hopSeconds,
        tempoMapper,
        tempoProjection: projection,
    });
}

function flattenChannelValues(channelValues: number[][]): number[] {
    const flattened: number[] = [];
    for (const channel of channelValues) {
        if (!channel?.length) {
            continue;
        }
        for (const value of channel) {
            flattened.push(value ?? 0);
        }
    }
    return flattened;
}

function splitValuesBySizes(values: number[], sizes: number[]): number[][] {
    const result: number[][] = [];
    let offset = 0;
    for (const size of sizes) {
        const length = Math.max(0, Math.floor(size ?? 0));
        const channel: number[] = [];
        for (let i = 0; i < length; i += 1) {
            channel.push(values[offset + i] ?? 0);
        }
        offset += length;
        result.push(channel);
    }
    return result;
}

interface ChannelMetadata {
    channels: number;
    aliases: string[] | null;
    layout: ChannelLayoutMeta | null;
}

function buildChannelMetadata(track: AudioFeatureTrack, cache: AudioFeatureCache): ChannelMetadata {
    const channels = Math.max(1, Math.floor(track.channels ?? 0) || 1);
    const trackLayout = track.channelLayout ?? null;
    const trackLayoutAliases = trackLayout?.aliases ?? null;
    const cacheAliases = cache.channelLayout?.aliases ?? null;
    const aliasesSource = trackLayoutAliases ?? cacheAliases ?? null;
    const normalizedTrackLayout = trackLayout
        ? {
              ...trackLayout,
              aliases: Array.isArray(trackLayout.aliases) ? [...trackLayout.aliases] : (trackLayout.aliases ?? null),
          }
        : null;
    const fallbackFromCache = cacheAliases ? { aliases: [...cacheAliases] } : null;
    const layout = (normalizedTrackLayout ?? fallbackFromCache) as ChannelLayoutMeta | null;
    return {
        channels,
        aliases: aliasesSource ? [...aliasesSource] : null,
        layout,
    };
}

function readNumericFrame(
    track: AudioFeatureTrack,
    index: number,
    channelIndex: number,
    format: Exclude<AudioFeatureTrackFormat, 'waveform-minmax'>
): number {
    const frame = Math.max(0, Math.min(track.frameCount - 1, index));
    const data = track.data as NumericArray;
    const channels = Math.max(1, track.channels);
    const clampedChannel = Math.max(0, Math.min(channels - 1, channelIndex));
    const offset = frame * channels + clampedChannel;
    const raw = data[offset] ?? 0;
    if (format === 'uint8') {
        return raw / 255;
    }
    if (format === 'int16') {
        return raw / 32768;
    }
    return raw;
}

function resolveWaveformVectorLength(track: AudioFeatureTrack): number {
    const channelCount = Math.max(1, track.channels || 1);
    return channelCount * 2;
}

function resolvePeriodicWaveformLength(track: AudioFeatureTrack): number {
    const metadata = (track.metadata ?? {}) as {
        frameLengths?: unknown;
        maxFrameLength?: unknown;
    };
    const explicit = Number(metadata.maxFrameLength);
    if (Number.isFinite(explicit) && explicit > 0) {
        return Math.max(0, Math.floor(explicit));
    }
    const lengths = Array.isArray(metadata.frameLengths) ? metadata.frameLengths : [];
    let maxLength = 0;
    for (const entry of lengths) {
        const numeric = Number(entry);
        if (Number.isFinite(numeric)) {
            maxLength = Math.max(maxLength, Math.floor(numeric));
        }
    }
    return Math.max(0, maxLength);
}

function readWaveformFrame(track: AudioFeatureTrack, index: number): number[][] {
    const frame = Math.max(0, Math.min(track.frameCount - 1, index));
    const payload = track.data as { min: Float32Array; max: Float32Array };
    const channelCount = Math.max(1, track.channels || 1);
    const minValues = payload.min ?? new Float32Array();
    const maxValues = payload.max ?? new Float32Array();
    const values: number[][] = [];
    for (let channel = 0; channel < channelCount; channel += 1) {
        const offset = frame * channelCount + channel;
        const min = minValues[offset] ?? 0;
        const max = maxValues[offset] ?? min;
        values.push([min, max]);
    }
    return values;
}

function readPeriodicWaveformFrame(track: AudioFeatureTrack, index: number): FrameVectorInfo {
    const frame = Math.max(0, Math.min(track.frameCount - 1, index));
    const data = (track.data as Float32Array) ?? new Float32Array();
    const metadata = (track.metadata ?? {}) as {
        frameOffsets?: unknown;
        frameLengths?: unknown;
        maxFrameLength?: unknown;
    };
    const offsets = Array.isArray(metadata.frameOffsets) ? metadata.frameOffsets : [];
    const lengths = Array.isArray(metadata.frameLengths) ? metadata.frameLengths : [];
    const rawOffset = Number(offsets[frame] ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const rawLength = Number(lengths[frame] ?? 0);
    const frameLength = Number.isFinite(rawLength) ? Math.max(0, Math.floor(rawLength)) : 0;
    const maxLength = Math.max(frameLength, resolvePeriodicWaveformLength(track));
    const values = new Array(Math.max(0, maxLength)).fill(0);
    if (frameLength <= 0 || data.length === 0) {
        return {
            flatValues: [...values],
            channelValues: [values.map((value) => value ?? 0)],
            channelSizes: [values.length],
            frameLength,
        };
    }
    const clampedOffset = Math.min(Math.max(0, offset), data.length);
    const available = Math.min(frameLength, data.length - clampedOffset, values.length);
    for (let i = 0; i < available; i += 1) {
        values[i] = data[clampedOffset + i] ?? 0;
    }
    const vector = values.map((value) => value ?? 0);
    return {
        flatValues: [...vector],
        channelValues: [vector],
        channelSizes: [vector.length],
        frameLength,
    };
}

function buildFrameVectorInfo(
    track: AudioFeatureTrack,
    frameIndex: number,
    options: TempoAlignedFrameOptions
): FrameVectorInfo {
    if (track.format === 'waveform-minmax') {
        const channelValues = readWaveformFrame(track, frameIndex);
        const result: FrameVectorInfo = {
            flatValues: flattenChannelValues(channelValues),
            channelValues,
            channelSizes: channelValues.map((channel) => channel.length),
        };
        recordObservedFrameShape(track, options, result);
        return result;
    }
    if (track.format === 'waveform-periodic') {
        const result = readPeriodicWaveformFrame(track, frameIndex);
        recordObservedFrameShape(track, options, result);
        return result;
    }
    const channels = Math.max(1, track.channels);
    const format = track.format as Exclude<AudioFeatureTrackFormat, 'waveform-minmax' | 'waveform-periodic'>;
    const channelValues: number[][] = [];
    if (options.bandIndex != null) {
        const target = Math.max(0, Math.min(channels - 1, Math.floor(options.bandIndex)));
        const value = readNumericFrame(track, frameIndex, target, format);
        channelValues.push([value]);
        const result: FrameVectorInfo = {
            flatValues: flattenChannelValues(channelValues),
            channelValues,
            channelSizes: [1],
        };
        recordObservedFrameShape(track, options, result);
        return result;
    }
    for (let channel = 0; channel < channels; channel += 1) {
        channelValues.push([readNumericFrame(track, frameIndex, channel, format)]);
    }
    const result: FrameVectorInfo = {
        flatValues: flattenChannelValues(channelValues),
        channelValues,
        channelSizes: channelValues.map((entry) => entry.length),
    };
    recordObservedFrameShape(track, options, result);
    return result;
}

function buildFrameVector(track: AudioFeatureTrack, frameIndex: number, options: TempoAlignedFrameOptions): number[] {
    return buildFrameVectorInfo(track, frameIndex, options).flatValues;
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

const DEFAULT_SILENT_SPECTROGRAM_DECIBELS = -80;

function resolveSilentFillValue(track: AudioFeatureTrack): number {
    const metadata = (track.metadata ?? {}) as { minDecibels?: unknown };
    const analysisParams = (track.analysisParams ?? {}) as { minDecibels?: unknown };
    const metadataMin = toFiniteNumber(metadata.minDecibels);
    const analysisMin = toFiniteNumber(analysisParams.minDecibels);
    if (metadataMin != null) {
        return metadataMin;
    }
    if (analysisMin != null) {
        return analysisMin;
    }
    const featureKey = parseFeatureTrackKey(track.key).featureKey;
    if (featureKey === 'spectrogram' || track.calculatorId === 'mvmnt.spectrogram') {
        return DEFAULT_SILENT_SPECTROGRAM_DECIBELS;
    }
    return 0;
}

function buildSilentVector(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): FrameVectorInfo {
    const shape = ensureFrameShape(track, options);
    const channelSizes = cloneChannelSizes(shape.channelSizes);
    const silentValue = resolveSilentFillValue(track);
    const channelValues = channelSizes.map((size) => new Array(size).fill(silentValue));
    const totalValues = channelSizes.reduce((total, size) => total + size, 0);
    const flatValues = new Array(totalValues).fill(silentValue);
    const frameLength =
        track.format === 'waveform-periodic'
            ? shape.frameLength != null && Number.isFinite(shape.frameLength)
                ? Math.max(0, Math.floor(shape.frameLength))
                : totalValues
            : undefined;
    return {
        flatValues,
        channelValues,
        channelSizes,
        frameLength,
    };
}

export function applySmoothingWindow(samples: number[][], radius: number): number[] {
    if (!samples.length) return [];
    const width = samples[0]?.length ?? 0;
    if (!width) return [];
    if (!Number.isFinite(radius) || radius <= 0) {
        return [...(samples[Math.floor(samples.length / 2)] ?? [])];
    }
    const totals = new Array(width).fill(0);
    for (const sample of samples) {
        for (let i = 0; i < width; i += 1) {
            totals[i] += sample[i] ?? 0;
        }
    }
    const factor = 1 / samples.length;
    for (let i = 0; i < width; i += 1) {
        totals[i] *= factor;
    }
    return totals;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function interpolateVectors(
    profile: TempoInterpolationProfile,
    base: number[],
    prev: number[],
    next: number[],
    nextNext: number[],
    frac: number
): number[] {
    if (profile === 'hold' || frac <= 1e-6) {
        return [...base];
    }
    if (profile === 'linear') {
        return base.map((value, index) => {
            const n = next[index] ?? value;
            return value + (n - value) * frac;
        });
    }
    if (profile === 'spline') {
        return base.map((value, index) => {
            const p0 = prev[index] ?? value;
            const p1 = value;
            const p2 = next[index] ?? value;
            const p3 = nextNext[index] ?? p2;
            return catmullRom(p0, p1, p2, p3, frac);
        });
    }
    return [...base];
}

function buildDiagnostics(
    request: TempoAlignedFrameRequest | TempoAlignedRangeRequest,
    sourceId: string | undefined,
    cacheHit: boolean,
    interpolation: TempoInterpolationProfile,
    mapperDurationNs: number,
    frameCount: number,
    fallbackReason: string | undefined,
    requestEndTick?: number
): TempoAlignedAdapterDiagnostics {
    return {
        trackId: request.trackId,
        sourceId,
        featureKey: request.featureKey,
        cacheHit,
        interpolation,
        mapperDurationNs,
        frameCount,
        requestStartTick: 'tick' in request ? request.tick : Math.min(request.startTick, request.endTick),
        requestEndTick: 'tick' in request ? request.tick : Math.max(request.startTick, request.endTick),
        fallbackReason,
        timestamp: Date.now(),
    };
}

/** Clip-aware source-time sampler used by modern `AudioTrack.clips` tracks. */
function getClipAwareFrame(state: TimelineState, request: TempoAlignedFrameRequest): TempoAlignedFrameResult {
    const options = request.options ?? {};
    const interpolation = options.interpolation ?? DEFAULT_INTERPOLATION;
    const track = state.tracks[request.trackId] as AudioTrack | undefined;
    if (!track || track.type !== 'audio') {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    const timing = createTimingContext(state.timeline, getSharedTimingManager().ticksPerQuarter);
    const segments = getAudioClipTimelineSegments(state, request.trackId, timing);
    const active = resolveAudioClipAtTick(state, request.trackId, request.tick, timing);
    // A gap is still a valid track read. Use the first available source only to
    // retain the feature's shape while returning a silent vector.
    const candidateSourceIds = active ? [active.sourceId] : segments.map((segment) => segment.sourceId);
    let sourceId: string | undefined;
    let cache: AudioFeatureCache | undefined;
    let featureTrack: AudioFeatureTrack | undefined;
    let resolvedFeatureKey: string | null = null;
    for (const candidate of candidateSourceIds) {
        const candidateCache = state.audioFeatureCaches[candidate];
        const resolvedFeature = resolveFeatureTrackFromCache(candidateCache, request.featureKey, {
            analysisProfileId: request.analysisProfileId,
        });
        if (candidateCache && resolvedFeature.track) {
            sourceId = candidate;
            cache = candidateCache;
            featureTrack = resolvedFeature.track;
            resolvedFeatureKey = resolvedFeature.key;
            break;
        }
    }
    if (!cache || !featureTrack || !sourceId) {
        const reason = active ? 'cache-missing' : segments.length ? 'feature-missing' : 'clip-missing';
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, active?.sourceId, false, interpolation, 0, 0, reason),
        };
    }
    const diagnosticsRequest = resolvedFeatureKey ? { ...request, featureKey: resolvedFeatureKey } : request;
    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(diagnosticsRequest, sourceId, true, interpolation, 0, 0, 'invalid-hop'),
        };
    }
    const channelMeta = buildChannelMetadata(featureTrack, cache);
    const tempoMapper = resolveTempoMapper(state);
    const hopTicks = resolveHopTicks(featureTrack, cache, tempoMapper);
    const mapperStart = nowNs();
    const startSeconds = resolveStartSeconds(featureTrack, cache);
    const frameFloat =
        active && active.sourceId === sourceId ? (active.sourceSeconds - startSeconds) / hopSeconds : Number.NaN;
    const buildSilentSample = (fractionalIndex: number): TempoAlignedFrameSample => {
        const base = Number.isFinite(fractionalIndex) ? Math.floor(fractionalIndex) : 0;
        const silent = buildSilentVector(featureTrack!, options);
        return {
            frameIndex: Math.max(0, Math.min(featureTrack!.frameCount - 1, base)),
            fractionalIndex,
            hopTicks,
            values: [...silent.flatValues],
            channels: silent.channelValues.length,
            channelValues: silent.channelValues.map((channel) => [...channel]),
            channelLayout: channelMeta.layout,
            format: featureTrack!.format,
            frameLength: silent.frameLength ?? 0,
        };
    };
    if (!Number.isFinite(frameFloat) || frameFloat < 0 || frameFloat >= featureTrack.frameCount) {
        const sample = buildSilentSample(frameFloat);
        return {
            sample,
            diagnostics: buildDiagnostics(
                diagnosticsRequest,
                sourceId,
                true,
                interpolation,
                nowNs() - mapperStart,
                1,
                undefined
            ),
        };
    }
    const baseIndex = Math.floor(frameFloat);
    const frac = frameFloat - baseIndex;
    const radius = Math.max(0, Math.floor(options.smoothing ?? 0));
    const getVectorInfo = (index: number): FrameVectorInfo =>
        index < 0 || index >= featureTrack!.frameCount
            ? buildSilentVector(featureTrack!, options)
            : buildFrameVectorInfo(featureTrack!, index, options);
    const smoothingSamples: number[][] = [];
    for (let i = -radius; i <= radius; i += 1) smoothingSamples.push(getVectorInfo(baseIndex + i).flatValues);
    const baseInfo = getVectorInfo(baseIndex);
    let values = applySmoothingWindow(smoothingSamples, radius);
    if (radius === 0) {
        values = interpolateVectors(
            interpolation,
            baseInfo.flatValues,
            getVectorInfo(baseIndex - 1).flatValues,
            getVectorInfo(baseIndex + 1).flatValues,
            getVectorInfo(baseIndex + 2).flatValues,
            frac
        );
    }
    const channelValues = splitValuesBySizes(values, baseInfo.channelSizes);
    return {
        sample: {
            frameIndex: Math.max(0, Math.min(featureTrack.frameCount - 1, baseIndex)),
            fractionalIndex: frameFloat,
            hopTicks,
            values,
            channels: channelValues.length,
            channelValues,
            channelLayout: channelMeta.layout,
            format: featureTrack.format,
            frameLength: baseInfo.frameLength,
        },
        diagnostics: buildDiagnostics(
            diagnosticsRequest,
            sourceId,
            true,
            interpolation,
            nowNs() - mapperStart,
            1,
            undefined
        ),
    };
}

function getClipAwareRange(state: TimelineState, request: TempoAlignedRangeRequest): TempoAlignedRangeResult {
    const options = request.options ?? {};
    const interpolation = options.interpolation ?? DEFAULT_INTERPOLATION;
    const track = state.tracks[request.trackId] as AudioTrack | undefined;
    if (!track || track.type !== 'audio') {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    const timing = createTimingContext(state.timeline, getSharedTimingManager().ticksPerQuarter);
    const segments = getAudioClipTimelineSegments(state, request.trackId, timing);
    const source = segments.find((segment) => {
        const cache = state.audioFeatureCaches[segment.sourceId];
        return Boolean(
            resolveFeatureTrackFromCache(cache, request.featureKey, { analysisProfileId: request.analysisProfileId })
                .track
        );
    });
    if (!source) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(
                request,
                segments[0]?.sourceId,
                false,
                interpolation,
                0,
                0,
                segments.length ? 'feature-missing' : 'clip-missing'
            ),
        };
    }
    const cache = state.audioFeatureCaches[source.sourceId]!;
    const resolvedFeature = resolveFeatureTrackFromCache(cache, request.featureKey, {
        analysisProfileId: request.analysisProfileId,
    });
    const featureTrack = resolvedFeature.track!;
    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, source.sourceId, true, interpolation, 0, 0, 'invalid-hop'),
        };
    }
    const tempoMapper = resolveTempoMapper(state);
    const startSeconds = tempoMapper.ticksToSeconds(Math.min(request.startTick, request.endTick));
    const endSeconds = tempoMapper.ticksToSeconds(Math.max(request.startTick, request.endTick));
    const padding = Math.max(0, Math.floor(options.framePadding ?? 0));
    const firstSeconds = startSeconds - padding * hopSeconds + hopSeconds / 2;
    const lastSeconds = endSeconds + padding * hopSeconds;
    const frameCount = Math.max(1, Math.floor((lastSeconds - firstSeconds) / hopSeconds) + 1);
    const firstFrame = getClipAwareFrame(state, {
        ...request,
        tick: tempoMapper.secondsToTicks(firstSeconds),
    }).sample;
    if (!firstFrame) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, source.sourceId, false, interpolation, 0, 0, 'feature-missing'),
        };
    }
    const vectorWidth = firstFrame.values.length;
    const data = new Float32Array(frameCount * vectorWidth);
    const frameTicks = new Float64Array(frameCount);
    const frameSeconds = new Float64Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
        const seconds = firstSeconds + frame * hopSeconds;
        const tick = tempoMapper.secondsToTicks(seconds);
        const sample = getClipAwareFrame(state, { ...request, tick }).sample;
        frameSeconds[frame] = seconds;
        frameTicks[frame] = tick;
        for (let i = 0; i < vectorWidth; i += 1) data[frame * vectorWidth + i] = sample?.values[i] ?? 0;
    }
    const trackStartTick = Math.min(...segments.map((segment) => segment.startTick));
    const trackEndTick = Math.max(...segments.map((segment) => segment.endTick));
    return {
        range: {
            hopTicks: resolveHopTicks(featureTrack, cache, tempoMapper),
            frameCount,
            channels: vectorWidth,
            format: firstFrame.format,
            data,
            frameTicks,
            frameSeconds,
            channelLayout: firstFrame.channelLayout ?? null,
            requestedStartTick: request.startTick,
            requestedEndTick: request.endTick,
            windowStartTick: Math.min(request.startTick, request.endTick),
            windowEndTick: Math.max(request.startTick, request.endTick),
            trackStartTick,
            trackEndTick,
            sourceId: source.sourceId,
        },
        diagnostics: buildDiagnostics(request, source.sourceId, true, interpolation, 0, frameCount, undefined),
    };
}

export function getTempoAlignedFrame(state: TimelineState, request: TempoAlignedFrameRequest): TempoAlignedFrameResult {
    const resolved = resolveAudioSourceTrack(state, request.trackId);
    if (!resolved) {
        const interpolation = request.options?.interpolation ?? DEFAULT_INTERPOLATION;
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    return getClipAwareFrame(state, request);
}

export function getTempoAlignedRange(state: TimelineState, request: TempoAlignedRangeRequest): TempoAlignedRangeResult {
    const resolved = resolveAudioSourceTrack(state, request.trackId);
    if (!resolved) {
        const interpolation = request.options?.interpolation ?? DEFAULT_INTERPOLATION;
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    return getClipAwareRange(state, request);
}
