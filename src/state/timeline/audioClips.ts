import type { AudioCacheEntry, AudioClip, AudioTrack } from '@audio/audioTypes';
import type { TimelineState } from '@state/timelineStore';
import { secondsToTicks, ticksToSeconds, type TimelineTimingContext } from '@state/timelineTime';

type AudioCache = TimelineState['audioCache'];

export interface AudioClipBounds {
    startTick: number;
    endTick: number;
}

export interface AudioClipSourceBounds {
    startSeconds: number;
    endSeconds: number;
}

/** A clip segment expressed in both timeline and immutable-source time. */
export interface AudioClipTimelineSegment {
    trackId: string;
    clip: AudioClip;
    sourceId: string;
    startTick: number;
    endTick: number;
    startSeconds: number;
    endSeconds: number;
    sourceStartSeconds: number;
    sourceEndSeconds: number;
    /** Stable enough for short-lived sampling caches; changes when placement/trim changes. */
    samplingIdentity: string;
}

export function makeAudioClipId(): string {
    return `aclip_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAudioClipsForTrack(track: AudioTrack): AudioClip[] {
    return track.clips;
}

export function getPrimaryAudioClip(track: AudioTrack): AudioClip | undefined {
    return getAudioClipsForTrack(track).find((clip) => clip.enabled !== false);
}

/**
 * Resolve enabled audio clips into timeline/source segments.
 */
export function getAudioClipTimelineSegments(
    state: Pick<TimelineState, 'tracks' | 'audioCache'>,
    trackId: string,
    timing: TimelineTimingContext,
): AudioClipTimelineSegment[] {
    const track = state.tracks[trackId] as AudioTrack | undefined;
    if (!track || track.type !== 'audio') return [];

    return getAudioClipsForTrack(track)
        .filter((clip) => clip.enabled !== false)
        .flatMap((clip) => {
            const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
            const source = getAudioClipSourceBounds(state.audioCache, clip);
            if (!bounds || !source) return [];
            const startSeconds = ticksToSeconds(timing, bounds.startTick);
            const endSeconds = ticksToSeconds(timing, bounds.endTick);
            if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return [];
            return [{
                trackId,
                clip,
                sourceId: clip.sourceId,
                startTick: bounds.startTick,
                endTick: bounds.endTick,
                startSeconds,
                endSeconds,
                sourceStartSeconds: source.startSeconds,
                sourceEndSeconds: source.endSeconds,
                samplingIdentity: `${trackId}:${clip.id}:${clip.sourceId}:${clip.offsetTicks}:${source.startSeconds}:${source.endSeconds}`,
            }];
        })
        .sort((a, b) => a.startTick - b.startTick || a.clip.id.localeCompare(b.clip.id));
}

/** Resolve the (non-overlapping) clip audible at a timeline tick. */
export function resolveAudioClipAtTick(
    state: Pick<TimelineState, 'tracks' | 'audioCache' | 'timeline'>,
    trackId: string,
    tick: number,
    timing: TimelineTimingContext,
): (AudioClipTimelineSegment & { sourceSeconds: number }) | null {
    if (!Number.isFinite(tick)) return null;
    const segments = getAudioClipTimelineSegments(state, trackId, timing);
    const segment = segments.find((candidate) => tick >= candidate.startTick && tick < candidate.endTick);
    if (!segment) return null;
    const timelineSeconds = ticksToSeconds(timing, tick);
    const placementSeconds = ticksToSeconds(timing, segment.clip.offsetTicks);
    const sourceSeconds = Math.max(
        segment.sourceStartSeconds,
        Math.min(segment.sourceEndSeconds, timelineSeconds - placementSeconds),
    );
    return { ...segment, sourceSeconds };
}

/** Return modern clip segments intersecting a timeline-second window. */
export function getAudioClipSegmentsInSeconds(
    state: Pick<TimelineState, 'tracks' | 'audioCache'>,
    trackId: string,
    startSeconds: number,
    endSeconds: number,
    timing: TimelineTimingContext,
): AudioClipTimelineSegment[] {
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return [];
    return getAudioClipTimelineSegments(state, trackId, timing).filter(
        (segment) => segment.endSeconds > startSeconds && segment.startSeconds < endSeconds,
    );
}

export function getAudioTrackSourceIds(track: AudioTrack): string[] {
    return Array.from(new Set(getAudioClipsForTrack(track).filter((clip) => clip.enabled !== false).map((clip) => clip.sourceId)));
}

/** Source trims are media-time offsets, independent of tempo and clip placement. */
export function getAudioClipSourceBounds(cache: AudioCache, clip: AudioClip): AudioClipSourceBounds | null {
    const source = cache[clip.sourceId];
    const durationSeconds = source?.durationSeconds;
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    const rawStart = clip.sourceStartSeconds ?? 0;
    const rawEnd = clip.sourceEndSeconds ?? durationSeconds;
    const startSeconds = Math.max(0, Math.min(durationSeconds, rawStart));
    const endSeconds = Math.max(startSeconds, Math.min(durationSeconds, rawEnd));
    return endSeconds > startSeconds ? { startSeconds, endSeconds } : null;
}

export function getAudioClipTimelineBounds(
    cache: AudioCache,
    clip: AudioClip,
    timing: TimelineTimingContext,
): AudioClipBounds | null {
    const source = getAudioClipSourceBounds(cache, clip);
    if (!source) return null;
    const clipStartSeconds = ticksToSeconds(timing, clip.offsetTicks);
    return {
        startTick: Math.round(secondsToTicks(timing, clipStartSeconds + source.startSeconds)),
        endTick: Math.round(secondsToTicks(timing, clipStartSeconds + source.endSeconds)),
    };
}

export function findReferencedAudioSourceIds(state: TimelineState): Set<string> {
    const ids = new Set<string>();
    for (const track of Object.values(state.tracks)) {
        if (!track || track.type !== 'audio') {
            continue;
        }
        for (const clip of getAudioClipsForTrack(track)) {
            ids.add(clip.sourceId);
        }
    }
    return ids;
}

/**
 * Clip regions are stored in source seconds.  With a tempo map, subtracting
 * timeline ticks from an offset does not produce a source-time trim point:
 * the same duration can occupy different tick widths at different positions.
 */
function sourceSecondsAtTimelineTick(
    clip: AudioClip,
    timelineTick: number,
    timing: TimelineTimingContext,
): number {
    return ticksToSeconds(timing, timelineTick) - ticksToSeconds(timing, clip.offsetTicks);
}

function clipWithTimelineEnd(
    clip: AudioClip,
    timelineEndTick: number,
    audioCache: AudioCache,
    timing: TimelineTimingContext,
): AudioClip | null {
    const source = getAudioClipSourceBounds(audioCache, clip);
    const sourceEndSeconds = sourceSecondsAtTimelineTick(clip, timelineEndTick, timing);
    if (!source || !Number.isFinite(sourceEndSeconds) || sourceEndSeconds <= source.startSeconds) return null;
    return {
        ...clip,
        sourceEndSeconds: Math.min(source.endSeconds, sourceEndSeconds),
    };
}

function clipWithTimelineStart(
    clip: AudioClip,
    timelineStartTick: number,
    audioCache: AudioCache,
    timing: TimelineTimingContext,
): AudioClip | null {
    const source = getAudioClipSourceBounds(audioCache, clip);
    const sourceStartSeconds = sourceSecondsAtTimelineTick(clip, timelineStartTick, timing);
    if (!source || !Number.isFinite(sourceStartSeconds) || sourceStartSeconds >= source.endSeconds) return null;
    return {
        ...clip,
        sourceStartSeconds: Math.max(source.startSeconds, sourceStartSeconds),
    };
}

export function resolveAudioClipOverlapWithCache(
    track: AudioTrack,
    editedClip: AudioClip,
    audioCache: AudioCache,
    timing: TimelineTimingContext,
): AudioClip[] {
    const editedBounds = getAudioClipTimelineBounds(audioCache, editedClip, timing);
    if (!editedBounds) {
        return getAudioClipsForTrack(track).filter((clip) => clip.id !== editedClip.id);
    }

    const resolved: AudioClip[] = [];
    for (const clip of getAudioClipsForTrack(track)) {
        if (clip.id === editedClip.id) {
            continue;
        }
        const bounds = getAudioClipTimelineBounds(audioCache, clip, timing);
        if (!bounds || bounds.endTick <= editedBounds.startTick || bounds.startTick >= editedBounds.endTick) {
            resolved.push(clip);
            continue;
        }
        if (bounds.startTick >= editedBounds.startTick && bounds.endTick <= editedBounds.endTick) {
            continue;
        }
        if (bounds.startTick < editedBounds.startTick) {
            const cropped = clipWithTimelineEnd(clip, editedBounds.startTick, audioCache, timing);
            if (cropped) {
                resolved.push(cropped);
            }
            continue;
        }
        const cropped = clipWithTimelineStart(clip, editedBounds.endTick, audioCache, timing);
        if (cropped) {
            resolved.push(cropped);
        }
    }

    resolved.push(editedClip);
    return resolved.sort((a, b) => {
        const aBounds = getAudioClipTimelineBounds(audioCache, a, timing);
        const bBounds = getAudioClipTimelineBounds(audioCache, b, timing);
        return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
    });
}

export function enforceNonOverlappingAudioClips(
    track: AudioTrack,
    audioCache: AudioCache,
    timing: TimelineTimingContext,
): AudioClip[] {
    let clips: AudioClip[] = [];
    const sorted = getAudioClipsForTrack(track)
        .filter((clip) => clip.enabled !== false)
        .sort((a, b) => {
            const aBounds = getAudioClipTimelineBounds(audioCache, a, timing);
            const bBounds = getAudioClipTimelineBounds(audioCache, b, timing);
            return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
        });
    for (const clip of sorted) {
        clips = resolveAudioClipOverlapWithCache({ ...track, clips }, clip, audioCache, timing);
    }
    return clips;
}

export function buildLightweightAudioCacheEntry(cache: AudioCacheEntry): AudioCacheEntry {
    const { audioBuffer: _audioBuffer, ...rest } = cache;
    return {
        ...rest,
        decodedState: cache.audioBuffer ? 'failed' : cache.decodedState ?? 'failed',
        decodedFailureReason: cache.audioBuffer ? 'decoded buffer omitted from lightweight cache entry' : cache.decodedFailureReason,
    };
}
