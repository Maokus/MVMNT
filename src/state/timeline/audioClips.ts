import type { AudioCacheEntry, AudioClip, AudioTrack } from '@audio/audioTypes';
import type { TimelineState } from '@state/timelineStore';

type AudioCache = TimelineState['audioCache'];

export interface AudioClipBounds {
    startTick: number;
    endTick: number;
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

export function getAudioClipLocalBounds(cache: AudioCache, clip: AudioClip): AudioClipBounds | null {
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

export function getAudioClipTimelineBounds(cache: AudioCache, clip: AudioClip): AudioClipBounds | null {
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
): AudioClip[] {
    const editedBounds = getAudioClipTimelineBounds(audioCache, editedClip);
    if (!editedBounds) {
        return getAudioClipsForTrack(track).filter((clip) => clip.id !== editedClip.id);
    }

    const resolved: AudioClip[] = [];
    for (const clip of getAudioClipsForTrack(track)) {
        if (clip.id === editedClip.id) {
            continue;
        }
        const bounds = getAudioClipTimelineBounds(audioCache, clip);
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
        const aBounds = getAudioClipTimelineBounds(audioCache, a);
        const bBounds = getAudioClipTimelineBounds(audioCache, b);
        return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
    });
}

export function enforceNonOverlappingAudioClips(track: AudioTrack, audioCache: AudioCache = {}): AudioClip[] {
    let clips: AudioClip[] = [];
    const sorted = getAudioClipsForTrack(track)
        .filter((clip) => clip.enabled !== false)
        .sort((a, b) => {
            const aBounds = getAudioClipTimelineBounds(audioCache, a);
            const bBounds = getAudioClipTimelineBounds(audioCache, b);
            return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
        });
    for (const clip of sorted) {
        clips = resolveAudioClipOverlapWithCache({ ...track, clips }, clip, audioCache);
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
