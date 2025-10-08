import { useTimelineStore } from '@state/timelineStore';
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

    const hopTicks = Math.max(1, featureTrack.hopTicks || cache.hopTicks || 1);
    const offsetTicks = track.offsetTicks ?? 0;
    const regionStart = track.regionStartTick ?? 0;
    const relativeTick = tick - offsetTicks + regionStart;
    const frameFloat = relativeTick / hopTicks;
    const baseIndex = Math.floor(frameFloat);
    const frac = frameFloat - baseIndex;

    const radius = Math.max(0, Math.floor(options.smoothing ?? 0));
    const samples: number[][] = [];
    for (let i = -radius; i <= radius; i += 1) {
        const idx = baseIndex + i;
        if (idx < 0 || idx >= featureTrack.frameCount) continue;
        samples.push(buildFrameVector(featureTrack, idx, options));
    }
    if (!samples.length) {
        samples.push(buildFrameVector(featureTrack, Math.max(0, Math.min(featureTrack.frameCount - 1, baseIndex)), options));
    }
    let values = averageVectors(samples);
    if (radius === 0 && frac > 1e-3 && featureTrack.format !== 'waveform-minmax') {
        const nextIndex = Math.min(featureTrack.frameCount - 1, baseIndex + 1);
        const nextVector = buildFrameVector(featureTrack, nextIndex, options);
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

    const hopTicks = Math.max(1, featureTrack.hopTicks || cache.hopTicks || 1);
    const offsetTicks = track.offsetTicks ?? 0;
    const regionStart = track.regionStartTick ?? 0;
    const localStart = startTick - offsetTicks + regionStart;
    const localEnd = endTick - offsetTicks + regionStart;
    const frameStart = Math.floor(Math.min(localStart, localEnd) / hopTicks);
    const frameEnd = Math.floor(Math.max(localStart, localEnd) / hopTicks);
    const padding = Math.max(0, Math.floor(options.framePadding ?? 0));
    const firstFrame = Math.max(0, frameStart - padding);
    const lastFrame = Math.min(featureTrack.frameCount - 1, frameEnd + padding);
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
    let writeIndex = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
        const sampleIndex = firstFrame + frame;
        const vector = buildFrameVector(featureTrack, sampleIndex, options);
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
