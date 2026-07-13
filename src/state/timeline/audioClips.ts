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

export function makeAudioClipId(): string {
    return `aclip_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAudioClipsForTrack(track: AudioTrack): AudioClip[] {
    if (Array.isArray(track.clips)) {
        return track.clips;
    }
    return [
        {
            id: `${track.id}__legacy_audio_clip`,
            type: 'audio',
            sourceId: track.audioSourceId ?? track.id,
            offsetTicks: track.offsetTicks ?? 0,
            regionStartTick: track.regionStartTick,
            regionEndTick: track.regionEndTick,
            name: track.name,
            enabled: true,
        },
    ];
}

export function getPrimaryAudioClip(track: AudioTrack): AudioClip | undefined {
    return getAudioClipsForTrack(track).find((clip) => clip.enabled !== false);
}

/** Source trims are media-time offsets, independent of tempo and clip placement. */
export function getAudioClipSourceBounds(cache: AudioCache, clip: AudioClip): AudioClipSourceBounds | null {
    const source = cache[clip.sourceId];
    const durationSeconds = source?.durationSeconds;
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    // The ratio fallback is only for in-memory legacy state before the V9 import migration runs.
    const legacyScale = source.durationTicks > 0 ? durationSeconds / source.durationTicks : 0;
    const rawStart = clip.sourceStartSeconds ?? ((clip.regionStartTick ?? 0) * legacyScale);
    const rawEnd = clip.sourceEndSeconds ?? (clip.regionEndTick != null ? clip.regionEndTick * legacyScale : durationSeconds);
    const startSeconds = Math.max(0, Math.min(durationSeconds, rawStart));
    const endSeconds = Math.max(startSeconds, Math.min(durationSeconds, rawEnd));
    return endSeconds > startSeconds ? { startSeconds, endSeconds } : null;
}

export function getAudioClipLocalBounds(cache: AudioCache, clip: AudioClip): AudioClipBounds | null {
    // Compatibility projection for older callers. New runtime code must use source bounds.
    const source = cache[clip.sourceId];
    const startTick = clip.regionStartTick ?? 0;
    const endTick = clip.regionEndTick ?? source?.durationTicks;
    if (typeof endTick !== 'number' || !Number.isFinite(startTick) || !Number.isFinite(endTick)) {
        return null;
    }
    if (endTick <= startTick) {
        return null;
    }
    return { startTick, endTick };
}

export function getAudioClipTimelineBounds(
    cache: AudioCache,
    clip: AudioClip,
    timing?: TimelineTimingContext,
): AudioClipBounds | null {
    if (timing) {
        const source = getAudioClipSourceBounds(cache, clip);
        if (!source) return null;
        const clipStartSeconds = ticksToSeconds(timing, clip.offsetTicks);
        return {
            startTick: Math.round(secondsToTicks(timing, clipStartSeconds + source.startSeconds)),
            endTick: Math.round(secondsToTicks(timing, clipStartSeconds + source.endSeconds)),
        };
    }
    const local = getAudioClipLocalBounds(cache, clip);
    if (!local) {
        return null;
    }
    return {
        startTick: clip.offsetTicks + local.startTick,
        endTick: clip.offsetTicks + local.endTick,
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

function clipWithLocalEnd(clip: AudioClip, localEndTick: number): AudioClip | null {
    const regionStartTick = clip.regionStartTick ?? 0;
    if (localEndTick <= regionStartTick) {
        return null;
    }
    return { ...clip, regionEndTick: localEndTick };
}

function clipWithLocalStart(clip: AudioClip, localStartTick: number): AudioClip | null {
    const regionEndTick = clip.regionEndTick;
    if (typeof regionEndTick === 'number' && localStartTick >= regionEndTick) {
        return null;
    }
    return { ...clip, regionStartTick: Math.max(0, localStartTick) };
}

export function resolveAudioClipOverlapWithCache(
    track: AudioTrack,
    editedClip: AudioClip,
    audioCache: AudioCache,
    timing?: TimelineTimingContext,
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
            const localEndTick = editedBounds.startTick - clip.offsetTicks;
            const cropped = clipWithLocalEnd(clip, localEndTick);
            if (cropped) {
                resolved.push(cropped);
            }
            continue;
        }
        const localStartTick = editedBounds.endTick - clip.offsetTicks;
        const cropped = clipWithLocalStart(clip, localStartTick);
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
    audioCache: AudioCache = {},
    timing?: TimelineTimingContext,
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
