import type { TimelineState, TimelineTrack } from '@state/timelineStore';

type MidiCache = TimelineState['midiCache'];

export interface MidiClip {
    id: string;
    type: 'midi';
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
    name?: string;
    enabled?: boolean;
}

export interface MidiClipBounds {
    startTick: number;
    endTick: number;
}

export function makeMidiClipId(): string {
    return `mclip_${Math.random().toString(36).slice(2, 10)}`;
}

export function getMidiClipsForTrack(track: TimelineTrack): MidiClip[] {
    if (Array.isArray(track.clips)) {
        return track.clips;
    }
    return [
        {
            id: `${track.id}__legacy_clip`,
            type: 'midi',
            sourceId: track.midiSourceId ?? track.id,
            offsetTicks: track.offsetTicks ?? 0,
            regionStartTick: track.regionStartTick,
            regionEndTick: track.regionEndTick,
            name: track.name,
            enabled: true,
        },
    ];
}

export function getPrimaryMidiClip(track: TimelineTrack): MidiClip | undefined {
    return getMidiClipsForTrack(track).find((clip) => clip.enabled !== false);
}

export function getMidiClipLocalBounds(cache: MidiCache, clip: MidiClip): MidiClipBounds | null {
    const source = cache[clip.sourceId];
    const sourceStart =
        source?.bounds?.minTick ??
        (source?.notesRaw?.length ? Math.min(...source.notesRaw.map((note) => note.startTick)) : 0);
    const sourceEnd =
        source?.bounds?.maxTick ??
        (source?.notesRaw?.length ? Math.max(...source.notesRaw.map((note) => note.endTick)) : undefined);

    const startTick = clip.regionStartTick ?? sourceStart;
    const endTick = clip.regionEndTick ?? sourceEnd;

    if (typeof endTick !== 'number' || !Number.isFinite(startTick) || !Number.isFinite(endTick)) {
        return null;
    }
    if (endTick <= startTick) {
        return null;
    }
    return { startTick, endTick };
}

export function getMidiClipTimelineBounds(cache: MidiCache, clip: MidiClip): MidiClipBounds | null {
    const local = getMidiClipLocalBounds(cache, clip);
    if (!local) {
        return null;
    }
    return {
        startTick: clip.offsetTicks + local.startTick,
        endTick: clip.offsetTicks + local.endTick,
    };
}

export function findReferencedMidiSourceIds(state: TimelineState): Set<string> {
    const ids = new Set<string>();
    for (const track of Object.values(state.tracks)) {
        if (!track || track.type !== 'midi') {
            continue;
        }
        for (const clip of getMidiClipsForTrack(track)) {
            ids.add(clip.sourceId);
        }
    }
    return ids;
}

function clipWithLocalEnd(clip: MidiClip, localEndTick: number): MidiClip | null {
    const regionStartTick = clip.regionStartTick ?? 0;
    if (localEndTick <= regionStartTick) {
        return null;
    }
    return { ...clip, regionEndTick: localEndTick };
}

function clipWithLocalStart(clip: MidiClip, localStartTick: number): MidiClip | null {
    const regionEndTick = clip.regionEndTick;
    if (typeof regionEndTick === 'number' && localStartTick >= regionEndTick) {
        return null;
    }
    return { ...clip, regionStartTick: Math.max(0, localStartTick) };
}

export function resolveMidiClipOverlap(track: TimelineTrack, editedClip: MidiClip): MidiClip[] {
    const allClips = getMidiClipsForTrack(track).filter((clip) => clip.id !== editedClip.id);
    const cache: MidiCache = {};
    for (const clip of [...allClips, editedClip]) {
        const startTick = clip.regionStartTick ?? 0;
        const endTick = clip.regionEndTick;
        if (typeof endTick === 'number') {
            cache[clip.sourceId] = {
                midiData: undefined as any,
                notesRaw: [],
                ccRaw: [],
                ticksPerQuarter: 0,
                bounds: { minTick: startTick, maxTick: endTick, minNote: 0, maxNote: 127, maxDurationTicks: 0 },
            };
        }
    }
    return resolveMidiClipOverlapWithCache(track, editedClip, cache);
}

export function resolveMidiClipOverlapWithCache(
    track: TimelineTrack,
    editedClip: MidiClip,
    cache: MidiCache
): MidiClip[] {
    const editedBounds = getMidiClipTimelineBounds(cache, editedClip);
    if (!editedBounds) {
        return getMidiClipsForTrack(track).filter((clip) => clip.id !== editedClip.id);
    }

    const resolved: MidiClip[] = [];
    for (const clip of getMidiClipsForTrack(track)) {
        if (clip.id === editedClip.id) {
            continue;
        }
        const bounds = getMidiClipTimelineBounds(cache, clip);
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
        const aBounds = getMidiClipTimelineBounds(cache, a);
        const bBounds = getMidiClipTimelineBounds(cache, b);
        return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
    });
}

export function enforceNonOverlappingMidiClips(track: TimelineTrack, cache: MidiCache = {}): MidiClip[] {
    let clips: MidiClip[] = [];
    const sorted = getMidiClipsForTrack(track)
        .filter((clip) => clip.enabled !== false)
        .sort((a, b) => {
            const aBounds = getMidiClipTimelineBounds(cache, a);
            const bBounds = getMidiClipTimelineBounds(cache, b);
            return (aBounds?.startTick ?? a.offsetTicks) - (bBounds?.startTick ?? b.offsetTicks);
        });
    for (const clip of sorted) {
        clips = resolveMidiClipOverlapWithCache({ ...track, clips }, clip, cache);
    }
    return clips;
}
