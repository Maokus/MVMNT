import { createTempoMapper, type TempoMapper } from '@core/timing';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import type {
    AudioFeatureCache,
    AudioFeatureTrack,
    AudioFeatureTrackFormat,
} from '@audio/features/audioFeatureTypes';

type NumericArray = Float32Array | Uint8Array | Int16Array;

export interface AudioFeatureFrameOptions {
    bandIndex?: number | null;
    channelIndex?: number | null;
    smoothing?: number;
}

export interface AudioFeatureFrameSample {
    frameIndex: number;
    fractionalIndex: number;
    hopTicks: number;
    values: number[];
    format: AudioFeatureTrackFormat;
}

export interface AudioFeatureRangeOptions extends AudioFeatureFrameOptions {
    framePadding?: number;
}

export interface AudioFeatureRangeSample {
    hopTicks: number;
    frameCount: number;
    channels: number;
    format: AudioFeatureTrackFormat;
    data: Float32Array;
    frameTicks: Float64Array;
    requestedStartTick: number;
    requestedEndTick: number;
    windowStartTick: number;
    windowEndTick: number;
    trackStartTick: number;
    trackEndTick: number;
    sourceId: string;
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
    if (typeof track.tempoProjection?.hopTicks === 'number') {
        return Math.max(1, Math.round(track.tempoProjection.hopTicks));
    }
    if (typeof cache.tempoProjection?.hopTicks === 'number') {
        return Math.max(1, Math.round(cache.tempoProjection.hopTicks));
    }
    const hopSeconds = resolveHopSeconds(track, cache);
    return Math.max(1, Math.round(tempoMapper.secondsToTicks(hopSeconds)));
}

export function selectAudioFeatureCache(state: TimelineState, sourceId: string):
    | AudioFeatureCache
    | undefined {
    return state.audioFeatureCaches[sourceId];
}

export function selectAudioFeatureStatus(state: TimelineState, sourceId: string) {
    return state.audioFeatureCacheStatus[sourceId];
}

export function selectAudioFeatureTrack(
    state: TimelineState,
    sourceId: string,
    trackKey: string,
): AudioFeatureTrack | undefined {
    const cache = state.audioFeatureCaches[sourceId];
    return cache?.featureTracks?.[trackKey];
}

function resolveAudioSourceTrack(state: TimelineState, trackId: string) {
    const track = state.tracks[trackId] as
        | (TimelineState['tracks'][string] & { type: 'audio'; audioSourceId?: string })
        | undefined;
    if (!track || track.type !== 'audio') return undefined;
    const sourceId = track.audioSourceId ?? trackId;
    return { track, sourceId } as const;
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

function averageVectors(samples: number[][]): number[] {
    if (!samples.length) return [];
    const width = samples[0]?.length ?? 0;
    if (!width) return [];
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

function buildFrameVector(
    track: AudioFeatureTrack,
    frameIndex: number,
    options: AudioFeatureFrameOptions,
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

function buildSilentVector(track: AudioFeatureTrack, options: AudioFeatureFrameOptions): number[] {
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

export function selectAudioFeatureFrame(
    state: TimelineState,
    trackId: string,
    featureKey: string,
    tick: number,
    options: AudioFeatureFrameOptions = {},
): AudioFeatureFrameSample | undefined {
    const resolved = resolveAudioSourceTrack(state, trackId);
    if (!resolved) return undefined;
    const { track, sourceId } = resolved;
    const cache = state.audioFeatureCaches[sourceId];
    if (!cache) return undefined;
    const featureTrack = cache.featureTracks?.[featureKey];
    if (!featureTrack || featureTrack.frameCount <= 0) return undefined;

    const tempoMapper = resolveTempoMapper(state);
    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return undefined;
    }
    const startSeconds = resolveStartSeconds(featureTrack, cache);
    const hopTicks = resolveHopTicks(featureTrack, cache, tempoMapper);
    const offsetTicks = track.offsetTicks ?? 0;
    const regionStart = track.regionStartTick ?? 0;
    const relativeTick = tick - offsetTicks + regionStart;
    const startTick = tempoMapper.secondsToTicks(startSeconds);

    const buildSilentSample = (fractionalIndex: number): AudioFeatureFrameSample => {
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
        return buildSilentSample(fractionalIndex);
    }

    const relativeSeconds = tempoMapper.ticksToSeconds(relativeTick);
    const frameFloat = (relativeSeconds - startSeconds) / hopSeconds;
    if (!Number.isFinite(frameFloat) || frameFloat < 0 || frameFloat >= featureTrack.frameCount) {
        return buildSilentSample(frameFloat);
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
    let values = averageVectors(samples);
    if (radius === 0 && frac > 1e-3 && featureTrack.format !== 'waveform-minmax') {
        const nextVector = getVector(baseIndex + 1);
        values = values.map((value, index) => {
            const next = nextVector[index] ?? value;
            return value + (next - value) * frac;
        });
    }

    return {
        frameIndex: Math.max(0, Math.min(featureTrack.frameCount - 1, baseIndex)),
        fractionalIndex: frameFloat,
        hopTicks,
        values,
        format: featureTrack.format,
    };
}

export function sampleAudioFeatureRange(
    state: TimelineState,
    trackId: string,
    featureKey: string,
    startTick: number,
    endTick: number,
    options: AudioFeatureRangeOptions = {},
): AudioFeatureRangeSample | undefined {
    const resolved = resolveAudioSourceTrack(state, trackId);
    if (!resolved) return undefined;
    const { track, sourceId } = resolved;
    const cache = state.audioFeatureCaches[sourceId];
    if (!cache) return undefined;
    const featureTrack = cache.featureTracks?.[featureKey];
    if (!featureTrack || featureTrack.frameCount <= 0) return undefined;

    const tempoMapper = resolveTempoMapper(state);
    const hopSeconds = resolveHopSeconds(featureTrack, cache);
    if (hopSeconds <= 0) {
        return undefined;
    }
    const startSeconds = resolveStartSeconds(featureTrack, cache);
    const hopTicks = resolveHopTicks(featureTrack, cache, tempoMapper);
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
        const totalSeconds = startSeconds + featureTrack.frameCount * hopSeconds;
        const regionDurationTicks = Math.max(
            0,
            tempoMapper.secondsToTicks(totalSeconds) - tempoMapper.secondsToTicks(startSeconds),
        );
        return regionStart + Math.round(regionDurationTicks);
    })();
    const regionLength = Math.max(0, regionEnd - regionStart);
    const trackStartTick = offsetTicks;
    const trackEndTick = trackStartTick + regionLength;
    const localStart = startTick - offsetTicks + regionStart;
    const localEnd = endTick - offsetTicks + regionStart;
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
        return undefined;
    }

    const isWaveform = featureTrack.format === 'waveform-minmax';
    const channels = (() => {
        if (isWaveform) return 2;
        if (options.channelIndex != null || options.bandIndex != null) return 1;
        return Math.max(1, featureTrack.channels);
    })();
    const data = new Float32Array(frameCount * channels);
    const frameTicks = new Float64Array(frameCount);
    const baseTick = offsetTicks - regionStart;
    const halfHopSeconds = hopSeconds / 2;
    let writeIndex = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
        const sampleIndex = firstFrame + frame;
        const vector =
            sampleIndex < 0 || sampleIndex >= featureTrack.frameCount
                ? buildSilentVector(featureTrack, options)
                : buildFrameVector(featureTrack, sampleIndex, options);
        const frameSeconds = startSeconds + sampleIndex * hopSeconds + halfHopSeconds;
        frameTicks[frame] = baseTick + tempoMapper.secondsToTicks(frameSeconds);
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

    return {
        hopTicks,
        frameCount,
        channels,
        format: featureTrack.format,
        data,
        frameTicks,
        requestedStartTick: startTick,
        requestedEndTick: endTick,
        windowStartTick: Math.min(startTick, endTick),
        windowEndTick: Math.max(startTick, endTick),
        trackStartTick,
        trackEndTick,
        sourceId,
    };
}

export function useAudioFeatureCache(sourceId: string): AudioFeatureCache | undefined {
    return useTimelineStore((s) => s.audioFeatureCaches[sourceId]);
}

export function useAudioFeatureStatus(sourceId: string) {
    return useTimelineStore((s) => s.audioFeatureCacheStatus[sourceId]);
}

export function useAudioFeatureTrack(sourceId: string, trackKey: string): AudioFeatureTrack | undefined {
    return useTimelineStore((s) => s.audioFeatureCaches[sourceId]?.featureTracks?.[trackKey]);
}
