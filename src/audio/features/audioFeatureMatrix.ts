import type { AudioTrack } from '@audio/audioTypes';
import { resolveFeatureTrackFromCache } from './featureTrackIdentity';
import type { AudioFeatureTrack, AudioFeatureTrackFormat } from './audioFeatureTypes';
import { getAudioClipsForTrack, getAudioClipTimelineSegments } from '@state/timeline/audioClips';
import { createTimingContext, ticksToSeconds } from '@state/timelineTime';
import { getSharedTimingManager, type TimelineState } from '@state/timelineStore';

export const MAX_AUDIO_FEATURE_MATRIX_SCALARS = 1_048_576;

export function validateAudioFeatureMatrixSize(frameCount: number, valuesPerFrame: number): number {
    const scalarCount = frameCount * valuesPerFrame;
    if (!Number.isSafeInteger(scalarCount) || scalarCount > MAX_AUDIO_FEATURE_MATRIX_SCALARS) {
        throw new RangeError(`Audio feature matrix exceeds ${MAX_AUDIO_FEATURE_MATRIX_SCALARS} scalar values`);
    }
    return scalarCount;
}

export interface AudioFeatureMatrixRequest {
    readonly trackId: string;
    readonly featureKey: string;
    readonly startSeconds: number;
    readonly stepSeconds: number;
    readonly frameCount: number;
    readonly interpolation?: 'linear' | 'nearest';
    readonly analysisProfileId?: string | null;
    /** Do not substitute another cached profile when this variant is unavailable. */
    readonly strictProfileMatching?: boolean;
}

export interface AudioFeatureMatrix {
    readonly revision: string;
    readonly startSeconds: number;
    readonly stepSeconds: number;
    readonly frameCount: number;
    readonly valuesPerFrame: number;
    readonly data: Float32Array;
    readonly coverage: Uint8Array;
    readonly format: AudioFeatureTrackFormat;
    readonly sampleRate?: number;
}

interface PreparedSource {
    readonly track: AudioFeatureTrack<Float32Array | Uint8Array | Int16Array>;
    readonly hopSeconds: number;
    readonly startTimeSeconds: number;
    readonly silentValue: number;
}

const featureTrackIds = new WeakMap<AudioFeatureTrack, number>();
let nextFeatureTrackId = 1;

function featureTrackId(track: AudioFeatureTrack): number {
    const existing = featureTrackIds.get(track);
    if (existing != null) return existing;
    const id = nextFeatureTrackId++;
    featureTrackIds.set(track, id);
    return id;
}

function metadataNumber(track: AudioFeatureTrack, key: string): number | undefined {
    const metadata = Number(track.metadata?.[key]);
    if (Number.isFinite(metadata)) return metadata;
    const analysis = Number(track.analysisParams?.[key]);
    return Number.isFinite(analysis) ? analysis : undefined;
}

function isPackedNumericTrack(
    track: AudioFeatureTrack
): track is AudioFeatureTrack<Float32Array | Uint8Array | Int16Array> {
    return track.format === 'float32' || track.format === 'uint8' || track.format === 'int16';
}

function read(track: PreparedSource['track'], frameIndex: number, channel: number, silentValue: number): number {
    if (frameIndex < 0 || frameIndex >= track.frameCount) return silentValue;
    const raw = track.data[frameIndex * Math.max(1, track.channels) + channel] ?? 0;
    if (track.format === 'uint8') return raw / 255;
    if (track.format === 'int16') return raw / 32768;
    return raw;
}

/**
 * Feature tracks can arrive before their audio asset has been hydrated during
 * scene import. The asset duration determines whether a clip has a timeline
 * segment at all, so it is part of the rendered matrix identity as well.
 */
function sourceAvailabilityIdentity(state: TimelineState, sourceId: string): string {
    const durationSeconds = state.audioCache[sourceId]?.durationSeconds;
    return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
        ? String(durationSeconds)
        : 'unavailable';
}

export function getAudioFeatureMatrixRevision(
    state: TimelineState,
    trackId: string,
    featureKey: string,
    analysisProfileId?: string | null,
    strictProfileMatching = false
): string | null {
    const timelineTrack = state.tracks[trackId] as AudioTrack | undefined;
    if (!timelineTrack || timelineTrack.type !== 'audio') return null;
    const identities: string[] = [];
    for (const clip of getAudioClipsForTrack(timelineTrack)) {
        if (clip.enabled === false) continue;
        const resolved = resolveFeatureTrackFromCache(state.audioFeatureCaches[clip.sourceId], featureKey, {
            analysisProfileId,
            strictProfileMatching,
        });
        if (!resolved.track || !isPackedNumericTrack(resolved.track)) continue;
        identities.push(
            [
                clip.id,
                clip.sourceId,
                clip.offsetTicks,
                clip.sourceStartSeconds ?? '',
                clip.sourceEndSeconds ?? '',
                sourceAvailabilityIdentity(state, clip.sourceId),
                featureTrackId(resolved.track),
            ].join(':')
        );
    }
    if (!identities.length) return null;
    return [
        trackId,
        featureKey,
        identities.join(','),
        state.timeline.globalBpm,
        state.timeline.beatsPerBar,
        JSON.stringify(state.timeline.masterTempoMap ?? []),
        getSharedTimingManager().ticksPerQuarter,
    ].join('|');
}

/**
 * Resolves clip placement and feature sources once, then returns a packed,
 * row-major snapshot. Its revision is an opaque session token for cache keys.
 */
export function readAudioFeatureMatrix(
    state: TimelineState,
    request: AudioFeatureMatrixRequest
): AudioFeatureMatrix | null {
    const frameCount = Math.floor(request.frameCount);
    if (
        !Number.isFinite(request.startSeconds) ||
        !Number.isFinite(request.stepSeconds) ||
        request.stepSeconds <= 0 ||
        frameCount <= 0
    ) {
        return null;
    }
    const timelineTrack = state.tracks[request.trackId] as AudioTrack | undefined;
    if (!timelineTrack || timelineTrack.type !== 'audio') return null;

    const sources = new Map<string, PreparedSource>();
    const identities: string[] = [];
    for (const clip of getAudioClipsForTrack(timelineTrack)) {
        if (clip.enabled === false) continue;
        const cache = state.audioFeatureCaches[clip.sourceId];
        const resolved = resolveFeatureTrackFromCache(cache, request.featureKey, {
            analysisProfileId: request.analysisProfileId,
            strictProfileMatching: request.strictProfileMatching,
        });
        if (!cache || !resolved.track || !isPackedNumericTrack(resolved.track)) continue;
        const track = resolved.track;
        const hopSeconds = track.hopSeconds > 0 ? track.hopSeconds : cache.hopSeconds;
        if (!Number.isFinite(hopSeconds) || hopSeconds <= 0) continue;
        if (!sources.has(clip.sourceId)) {
            sources.set(clip.sourceId, {
                track,
                hopSeconds,
                startTimeSeconds: Number.isFinite(track.startTimeSeconds)
                    ? track.startTimeSeconds
                    : cache.startTimeSeconds,
                silentValue: metadataNumber(track, 'minDecibels') ?? 0,
            });
        }
        identities.push(
            [
                clip.id,
                clip.sourceId,
                clip.offsetTicks,
                clip.sourceStartSeconds ?? '',
                clip.sourceEndSeconds ?? '',
                featureTrackId(track),
            ].join(':')
        );
    }
    const firstSource = sources.values().next().value as PreparedSource | undefined;
    if (!firstSource) return null;
    const valuesPerFrame = Math.max(1, firstSource.track.channels);
    const scalarCount = validateAudioFeatureMatrixSize(frameCount, valuesPerFrame);
    for (const source of sources.values()) {
        if (
            source.track.channels !== valuesPerFrame ||
            source.track.format !== firstSource.track.format
        ) {
            return null;
        }
    }

    const timing = createTimingContext(state.timeline, getSharedTimingManager().ticksPerQuarter);
    const segments = getAudioClipTimelineSegments(state, request.trackId, timing);
    const data = new Float32Array(scalarCount);
    const coverage = new Uint8Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
        const time = request.startSeconds + frame * request.stepSeconds;
        const segment = segments.find((candidate) => time >= candidate.startSeconds && time < candidate.endSeconds);
        const source = segment ? sources.get(segment.sourceId) : undefined;
        const baseOffset = frame * valuesPerFrame;
        if (!source || !segment) {
            data.fill(firstSource.silentValue, baseOffset, baseOffset + valuesPerFrame);
            continue;
        }
        coverage[frame] = 1;
        const placementSeconds = ticksToSeconds(timing, segment.clip.offsetTicks);
        const sourceSeconds = Math.max(
            segment.sourceStartSeconds,
            Math.min(segment.sourceEndSeconds, time - placementSeconds)
        );
        const frameFloat = (sourceSeconds - source.startTimeSeconds) / source.hopSeconds;
        if (!Number.isFinite(frameFloat) || frameFloat < 0 || frameFloat >= source.track.frameCount) {
            data.fill(source.silentValue, baseOffset, baseOffset + valuesPerFrame);
            continue;
        }
        const nearest = request.interpolation === 'nearest';
        const lower = nearest ? Math.round(frameFloat) : Math.floor(frameFloat);
        const fraction = nearest ? 0 : frameFloat - lower;
        for (let channel = 0; channel < valuesPerFrame; channel += 1) {
            const current = read(source.track, lower, channel, source.silentValue);
            const next = read(source.track, lower + 1, channel, source.silentValue);
            data[baseOffset + channel] = current + (next - current) * fraction;
        }
    }

    const revision =
        getAudioFeatureMatrixRevision(
            state,
            request.trackId,
            request.featureKey,
            request.analysisProfileId
        ) ?? identities.join(',');
    const sampleRate = metadataNumber(firstSource.track, 'sampleRate');
    return {
        revision,
        startSeconds: request.startSeconds,
        stepSeconds: request.stepSeconds,
        frameCount,
        valuesPerFrame,
        data,
        coverage,
        format: firstSource.track.format,
        ...(sampleRate !== undefined ? { sampleRate } : {}),
    };
}
