import { createTempoMapper, type TempoMapper } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import type {
    AudioFeatureCache,
    AudioFeatureTrack,
    AudioFeatureTrackFormat,
} from './audioFeatureTypes';
import { normalizeHopTicks, quantizeHopTicks } from './hopQuantization';

type NumericArray = Float32Array | Uint8Array | Int16Array;

const DEFAULT_INTERPOLATION: TempoInterpolationProfile = 'linear';

export type TempoInterpolationProfile = 'hold' | 'linear' | 'spline';

export interface TempoAlignedFrameOptions {
    bandIndex?: number | null;
    channelIndex?: number | null;
    smoothing?: number;
    interpolation?: TempoInterpolationProfile;
}

export interface TempoAlignedRangeOptions extends TempoAlignedFrameOptions {
    framePadding?: number;
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
    format: AudioFeatureTrackFormat;
}

export interface TempoAlignedRangeSample {
    hopTicks: number;
    frameCount: number;
    channels: number;
    format: AudioFeatureTrackFormat;
    data: Float32Array;
    frameTicks: Float64Array;
    frameSeconds?: Float64Array;
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
}

export interface TempoAlignedRangeRequest {
    trackId: string;
    featureKey: string;
    startTick: number;
    endTick: number;
    options?: TempoAlignedRangeOptions;
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
    const track = state.tracks[trackId] as
        | (TimelineState['tracks'][string] & { type: 'audio'; audioSourceId?: string })
        | undefined;
    if (!track || track.type !== 'audio') return undefined;
    const sourceId = track.audioSourceId ?? trackId;
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

function resolveHopTicks(
    track: AudioFeatureTrack,
    cache: AudioFeatureCache,
    tempoMapper: TempoMapper,
): number {
    const direct = normalizeHopTicks(track.hopTicks);
    if (direct != null) {
        return direct;
    }
    const cacheHop = normalizeHopTicks(cache.hopTicks);
    if (cacheHop != null) {
        return cacheHop;
    }
    const projection =
        normalizeHopTicks(track.tempoProjection?.hopTicks) != null
            ? track.tempoProjection
            : cache.tempoProjection;
    const hopSeconds = resolveHopSeconds(track, cache);
    return quantizeHopTicks({
        hopSeconds,
        tempoMapper,
        tempoProjection: projection,
    });
}

function readNumericFrame(
    track: AudioFeatureTrack,
    index: number,
    channelIndex: number,
    format: Exclude<AudioFeatureTrackFormat, 'waveform-minmax'>,
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

function readWaveformFrame(track: AudioFeatureTrack, index: number): [number, number] {
    const frame = Math.max(0, Math.min(track.frameCount - 1, index));
    const payload = track.data as { min: Float32Array; max: Float32Array };
    const min = payload.min?.[frame] ?? 0;
    const max = payload.max?.[frame] ?? 0;
    return [min, max];
}

function buildFrameVector(
    track: AudioFeatureTrack,
    frameIndex: number,
    options: TempoAlignedFrameOptions,
): number[] {
    if (track.format === 'waveform-minmax') {
        const [min, max] = readWaveformFrame(track, frameIndex);
        return [min, max];
    }
    const channels = Math.max(1, track.channels);
    const format = track.format as Exclude<AudioFeatureTrackFormat, 'waveform-minmax'>;
    const targetChannel = options.channelIndex ?? options.bandIndex ?? null;
    if (targetChannel != null) {
        const value = readNumericFrame(track, frameIndex, targetChannel, format);
        return [value];
    }
    const vector: number[] = [];
    for (let channel = 0; channel < channels; channel += 1) {
        vector.push(readNumericFrame(track, frameIndex, channel, format));
    }
    return vector;
}

function buildSilentVector(track: AudioFeatureTrack, options: TempoAlignedFrameOptions): number[] {
    if (track.format === 'waveform-minmax') {
        return [0, 0];
    }
    const targetChannel = options.channelIndex ?? options.bandIndex ?? null;
    if (targetChannel != null) {
        return [0];
    }
    const channels = Math.max(1, track.channels || 1);
    return Array.from({ length: channels }, () => 0);
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
    return (
        0.5 *
        (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
}

function interpolateVectors(
    profile: TempoInterpolationProfile,
    base: number[],
    prev: number[],
    next: number[],
    nextNext: number[],
    frac: number,
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

function sampleLegacyFrame(
    track: AudioFeatureTrack,
    cache: AudioFeatureCache,
    relativeTick: number,
    hopTicks: number,
    options: TempoAlignedFrameOptions,
): TempoAlignedFrameSample | undefined {
    if (!Number.isFinite(relativeTick)) {
        return undefined;
    }
    const startTick = track.tempoProjection?.startTick ?? cache.tempoProjection?.startTick ?? 0;
    const fractionalIndex = (relativeTick - startTick) / Math.max(1, hopTicks);
    const baseIndex = Math.floor(fractionalIndex);
    const frameIndex = Math.max(0, Math.min(track.frameCount - 1, baseIndex));
    if (!Number.isFinite(fractionalIndex)) {
        return {
            frameIndex,
            fractionalIndex,
            hopTicks,
            values: buildSilentVector(track, options),
            format: track.format,
        };
    }
    if (fractionalIndex < 0 || fractionalIndex >= track.frameCount) {
        return {
            frameIndex,
            fractionalIndex,
            hopTicks,
            values: buildSilentVector(track, options),
            format: track.format,
        };
    }
    const frac = fractionalIndex - baseIndex;
    const baseVector = buildFrameVector(track, frameIndex, options);
    const profile = options.interpolation ?? DEFAULT_INTERPOLATION;
    let values = [...baseVector];
    if (profile !== 'hold') {
        const prevVector = buildFrameVector(track, frameIndex - 1, options);
        const nextVector = buildFrameVector(track, frameIndex + 1, options);
        const nextNextVector = buildFrameVector(track, frameIndex + 2, options);
        values = interpolateVectors(profile, baseVector, prevVector, nextVector, nextNextVector, frac);
    }
    return {
        frameIndex,
        fractionalIndex,
        hopTicks,
        values,
        format: track.format,
    };
}

function resolveAdapterToggle(state: TimelineState): boolean {
    const enabled = state.hybridCacheRollout?.adapterEnabled;
    return enabled !== false;
}

function buildDiagnostics(
    request: TempoAlignedFrameRequest | TempoAlignedRangeRequest,
    sourceId: string | undefined,
    cacheHit: boolean,
    interpolation: TempoInterpolationProfile,
    mapperDurationNs: number,
    frameCount: number,
    fallbackReason: string | undefined,
    requestEndTick?: number,
): TempoAlignedAdapterDiagnostics {
    return {
        trackId: request.trackId,
        sourceId,
        featureKey: request.featureKey,
        cacheHit,
        interpolation,
        mapperDurationNs,
        frameCount,
        requestStartTick:
            'tick' in request ? request.tick : Math.min(request.startTick, request.endTick),
        requestEndTick: 'tick' in request ? request.tick : Math.max(request.startTick, request.endTick),
        fallbackReason,
        timestamp: Date.now(),
    };
}

export function getTempoAlignedFrame(
    state: TimelineState,
    request: TempoAlignedFrameRequest,
): TempoAlignedFrameResult {
    const options = request.options ?? {};
    const interpolation = options.interpolation ?? DEFAULT_INTERPOLATION;
    const resolved = resolveAudioSourceTrack(state, request.trackId);
    if (!resolved) {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    const { track, sourceId } = resolved;
    const cache = state.audioFeatureCaches[sourceId];
    if (!cache) {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, sourceId, false, interpolation, 0, 0, 'cache-missing'),
        };
    }
    const featureTrack = cache.featureTracks?.[request.featureKey];
    if (!featureTrack || featureTrack.frameCount <= 0) {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, sourceId, false, interpolation, 0, 0, 'feature-missing'),
        };
    }

    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return {
            sample: undefined,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, 0, 0, 'invalid-hop'),
        };
    }

    const startSeconds = resolveStartSeconds(featureTrack, cache);
    const adapterEnabled = resolveAdapterToggle(state);
    const offsetTicks = track.offsetTicks ?? 0;
    const regionStart = track.regionStartTick ?? 0;
    const relativeTick = request.tick - offsetTicks + regionStart;

    if (!adapterEnabled) {
        const hopTicksLegacy = featureTrack.hopTicks ?? cache.hopTicks ?? 0;
        const sample = sampleLegacyFrame(featureTrack, cache, relativeTick, hopTicksLegacy, options);
        return {
            sample,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, 0, sample ? 1 : 0, 'adapter-disabled'),
        };
    }

    const tempoMapper = resolveTempoMapper(state);
    const hopTicks = resolveHopTicks(featureTrack, cache, tempoMapper);
    const mapperStart = nowNs();
    const startTick = tempoMapper.secondsToTicks(startSeconds);

    const buildSilentSample = (fractionalIndex: number): TempoAlignedFrameSample => {
        const base = Number.isFinite(fractionalIndex) ? Math.floor(fractionalIndex) : 0;
        return {
            frameIndex: Math.max(0, Math.min(featureTrack.frameCount - 1, base)),
            fractionalIndex,
            hopTicks,
            values: buildSilentVector(featureTrack, options),
            format: featureTrack.format,
        };
    };

    if (!Number.isFinite(relativeTick) || relativeTick < startTick) {
        const fractionalIndex = (relativeTick - startTick) / Math.max(1, hopTicks);
        const mapperDurationNs = nowNs() - mapperStart;
        const sample = buildSilentSample(fractionalIndex);
        return {
            sample,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, mapperDurationNs, 1, undefined),
        };
    }

    const relativeSeconds = tempoMapper.ticksToSeconds(relativeTick);
    const frameFloat = (relativeSeconds - startSeconds) / hopSeconds;
    const mapperDurationNs = nowNs() - mapperStart;
    if (!Number.isFinite(frameFloat) || frameFloat < 0 || frameFloat >= featureTrack.frameCount) {
        const sample = buildSilentSample(frameFloat);
        return {
            sample,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, mapperDurationNs, 1, undefined),
        };
    }

    const baseIndex = Math.floor(frameFloat);
    const frac = frameFloat - baseIndex;
    const radius = Math.max(0, Math.floor(options.smoothing ?? 0));
    const samples: number[][] = [];
    const getVector = (index: number) => {
        if (index < 0 || index >= featureTrack.frameCount) {
            return buildSilentVector(featureTrack, options);
        }
        return buildFrameVector(featureTrack, index, options);
    };
    for (let i = -radius; i <= radius; i += 1) {
        const idx = baseIndex + i;
        samples.push(getVector(idx));
    }
    if (!samples.length) {
        samples.push(getVector(baseIndex));
    }
    let values = applySmoothingWindow(samples, radius);
    if (radius === 0) {
        const prevVector = getVector(baseIndex - 1);
        const baseVector = getVector(baseIndex);
        const nextVector = getVector(baseIndex + 1);
        const nextNextVector = getVector(baseIndex + 2);
        values = interpolateVectors(interpolation, baseVector, prevVector, nextVector, nextNextVector, frac);
    }

    const sample: TempoAlignedFrameSample = {
        frameIndex: Math.max(0, Math.min(featureTrack.frameCount - 1, baseIndex)),
        fractionalIndex: frameFloat,
        hopTicks,
        values,
        format: featureTrack.format,
    };

    return {
        sample,
        diagnostics: buildDiagnostics(request, sourceId, true, interpolation, mapperDurationNs, 1, undefined),
    };
}

export function getTempoAlignedRange(
    state: TimelineState,
    request: TempoAlignedRangeRequest,
): TempoAlignedRangeResult {
    const options = request.options ?? {};
    const interpolation = options.interpolation ?? DEFAULT_INTERPOLATION;
    const resolved = resolveAudioSourceTrack(state, request.trackId);
    if (!resolved) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, undefined, false, interpolation, 0, 0, 'track-missing'),
        };
    }
    const { track, sourceId } = resolved;
    const cache = state.audioFeatureCaches[sourceId];
    if (!cache) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, sourceId, false, interpolation, 0, 0, 'cache-missing'),
        };
    }
    const featureTrack = cache.featureTracks?.[request.featureKey];
    if (!featureTrack || featureTrack.frameCount <= 0) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, sourceId, false, interpolation, 0, 0, 'feature-missing'),
        };
    }

    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, 0, 0, 'invalid-hop'),
        };
    }

    const adapterEnabled = resolveAdapterToggle(state);
    const offsetTicks = track.offsetTicks ?? 0;
    const regionStart = track.regionStartTick ?? 0;
    const regionEnd = (() => {
        if (typeof track.regionEndTick === 'number' && Number.isFinite(track.regionEndTick)) {
            return track.regionEndTick;
        }
        const cacheEntry = state.audioCache?.[sourceId];
        if (cacheEntry && typeof cacheEntry.durationTicks === 'number') {
            return cacheEntry.durationTicks;
        }
        return undefined;
    })();
    const regionLength = (() => {
        if (typeof regionEnd === 'number') {
            return Math.max(0, regionEnd - regionStart);
        }
        const startSeconds = resolveStartSeconds(featureTrack, cache);
        const totalSeconds = startSeconds + featureTrack.frameCount * hopSeconds;
        const tempoMapper = resolveTempoMapper(state);
        const startTick = tempoMapper.secondsToTicks(startSeconds);
        const endTick = tempoMapper.secondsToTicks(totalSeconds);
        return Math.max(0, Math.round(endTick - startTick));
    })();
    const trackStartTick = offsetTicks;
    const trackEndTick = trackStartTick + regionLength;
    const localStart = request.startTick - offsetTicks + regionStart;
    const localEnd = request.endTick - offsetTicks + regionStart;

    if (!adapterEnabled) {
        const hopTicksLegacy = featureTrack.hopTicks ?? cache.hopTicks ?? 0;
        if (hopTicksLegacy <= 0) {
            return {
                range: undefined,
                diagnostics: buildDiagnostics(request, sourceId, true, interpolation, 0, 0, 'adapter-disabled'),
            };
        }
        const padding = Math.max(0, Math.floor(options.framePadding ?? 0));
        const startTick = featureTrack.tempoProjection?.startTick ?? cache.tempoProjection?.startTick ?? 0;
        const frameStart = Math.floor((Math.min(localStart, localEnd) - startTick) / hopTicksLegacy) - padding;
        const frameEnd = Math.floor((Math.max(localStart, localEnd) - startTick) / hopTicksLegacy) + padding;
        const firstFrame = Math.max(0, Math.min(featureTrack.frameCount - 1, frameStart));
        const lastFrame = Math.max(firstFrame, Math.min(featureTrack.frameCount - 1, frameEnd));
        const frameCount = lastFrame - firstFrame + 1;
        const isWaveform = featureTrack.format === 'waveform-minmax';
        const channels = (() => {
            if (isWaveform) return 2;
            if (options.channelIndex != null || options.bandIndex != null) return 1;
            return Math.max(1, featureTrack.channels);
        })();
        const data = new Float32Array(frameCount * channels);
        const frameTicks = new Float64Array(frameCount);
        let writeIndex = 0;
        for (let frame = 0; frame < frameCount; frame += 1) {
            const sampleIndex = firstFrame + frame;
            const vector =
                sampleIndex < 0 || sampleIndex >= featureTrack.frameCount
                    ? buildSilentVector(featureTrack, options)
                    : buildFrameVector(featureTrack, sampleIndex, options);
            frameTicks[frame] = trackStartTick + (startTick + sampleIndex * hopTicksLegacy);
            if (isWaveform) {
                const [min, max] = vector;
                data[writeIndex++] = min ?? 0;
                data[writeIndex++] = max ?? 0;
            } else if (channels === 1) {
                data[writeIndex++] = vector[0] ?? 0;
            } else {
                for (let channel = 0; channel < channels; channel += 1) {
                    data[writeIndex++] = vector[channel] ?? 0;
                }
            }
        }
        const range: TempoAlignedRangeSample = {
            hopTicks: hopTicksLegacy,
            frameCount,
            channels,
            format: featureTrack.format,
            data,
            frameTicks,
            requestedStartTick: request.startTick,
            requestedEndTick: request.endTick,
            windowStartTick: Math.min(request.startTick, request.endTick),
            windowEndTick: Math.max(request.startTick, request.endTick),
            trackStartTick,
            trackEndTick,
            sourceId,
        };
        return {
            range,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, 0, frameCount, 'adapter-disabled'),
        };
    }

    const tempoMapper = resolveTempoMapper(state);
    const hopTicks = resolveHopTicks(featureTrack, cache, tempoMapper);
    const mapperStart = nowNs();
    const startSeconds = resolveStartSeconds(featureTrack, cache);
    const localStartSeconds = tempoMapper.ticksToSeconds(localStart);
    const localEndSeconds = tempoMapper.ticksToSeconds(localEnd);
    const normalizedStartSeconds = (Math.min(localStartSeconds, localEndSeconds) - startSeconds) / hopSeconds;
    const normalizedEndSeconds = (Math.max(localStartSeconds, localEndSeconds) - startSeconds) / hopSeconds;
    const frameStart = Math.floor(normalizedStartSeconds);
    const frameEnd = Math.floor(normalizedEndSeconds);
    const padding = Math.max(0, Math.floor(options.framePadding ?? 0));
    const firstFrame = frameStart - padding;
    const lastFrame = frameEnd + padding;
    const frameCount = Math.max(0, lastFrame - firstFrame + 1);
    if (frameCount <= 0) {
        const mapperDurationNs = nowNs() - mapperStart;
        return {
            range: undefined,
            diagnostics: buildDiagnostics(request, sourceId, true, interpolation, mapperDurationNs, 0, undefined),
        };
    }

    const isWaveform = featureTrack.format === 'waveform-minmax';
    const channels = (() => {
        if (isWaveform) return 2;
        if (options.channelIndex != null || options.bandIndex != null) return 1;
        return Math.max(1, featureTrack.channels);
    })();
    const data = new Float32Array(frameCount * channels);
    const frameSeconds = new Float64Array(frameCount);
    const baseTick = offsetTicks - regionStart;
    const halfHopSeconds = hopSeconds / 2;
    let writeIndex = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
        const sampleIndex = firstFrame + frame;
        const vector =
            sampleIndex < 0 || sampleIndex >= featureTrack.frameCount
                ? buildSilentVector(featureTrack, options)
                : buildFrameVector(featureTrack, sampleIndex, options);
        frameSeconds[frame] = startSeconds + sampleIndex * hopSeconds + halfHopSeconds;
        if (isWaveform) {
            const [min, max] = vector;
            data[writeIndex++] = min ?? 0;
            data[writeIndex++] = max ?? 0;
            continue;
        }
        if (channels === 1) {
            data[writeIndex++] = vector[0] ?? 0;
        } else {
            for (let channel = 0; channel < channels; channel += 1) {
                data[writeIndex++] = vector[channel] ?? 0;
            }
        }
    }
    const projectedTicks = tempoMapper.secondsToTicksBatch(frameSeconds);
    const frameTicks = new Float64Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
        frameTicks[frame] = baseTick + (projectedTicks[frame] ?? 0);
    }
    const mapperDurationNs = nowNs() - mapperStart;
    const range: TempoAlignedRangeSample = {
        hopTicks,
        frameCount,
        channels,
        format: featureTrack.format,
        data,
        frameTicks,
        frameSeconds,
        requestedStartTick: request.startTick,
        requestedEndTick: request.endTick,
        windowStartTick: Math.min(request.startTick, request.endTick),
        windowEndTick: Math.max(request.startTick, request.endTick),
        trackStartTick,
        trackEndTick,
        sourceId,
    };

    return {
        range,
        diagnostics: buildDiagnostics(request, sourceId, true, interpolation, mapperDurationNs, frameCount, undefined),
    };
}
