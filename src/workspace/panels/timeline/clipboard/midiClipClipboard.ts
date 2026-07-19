import type { TimelineState } from '@state/timelineStore';
import {
    getMidiClipTimelineBounds,
    getMidiClipsForTrack,
    makeMidiClipId,
    type MidiClip,
} from '@state/timeline/midiClips';
import type { AudioClip } from '@audio/audioTypes';
import {
    getAudioClipTimelineBounds,
    getAudioClipsForTrack,
    makeAudioClipId,
} from '@state/timeline/audioClips';
import type { ClipTimelineSelection, TimelineClipRef } from '@state/selectionStore';
import type { TimelineMidiCacheEntry } from '@state/timeline/patches';
import type { AudioCacheEntry } from '@audio/audioTypes';
import { createTimingContext, secondsToTicks, ticksToSeconds } from '@state/timelineTime';
import { getAudioClipSourceBounds } from '@state/timeline/audioClips';

export type { TimelineClipRef };

export type MidiClipClipboard = {
    kind: 'mvmnt.midi-clips';
    version: 1;
    sources?: Array<{
        sourceId: string;
        cache: TimelineMidiCacheEntry;
    }>;
    clips: Array<{
        sourceTrackId: string;
        sourceClipId: string;
        sourceId: string;
        offsetTicks: number;
        regionStartTick?: number;
        regionEndTick?: number;
        name?: string;
        enabled?: boolean;
    }>;
    anchorTick: number;
    sourceTrackOrder: string[];
};

export type TimelineClipClipboard = {
    kind: 'mvmnt.timeline-clips';
    version: 1;
    midiSources?: Array<{ sourceId: string; cache: TimelineMidiCacheEntry }>;
    audioSources?: Array<{ sourceId: string; cache: AudioCacheEntry }>;
    clips: Array<{
        kind: 'midi' | 'audio';
        sourceTrackId: string;
        sourceClipId: string;
        sourceId: string;
        offsetTicks: number;
        regionStartTick?: number;
        regionEndTick?: number;
        sourceStartSeconds?: number;
        sourceEndSeconds?: number;
        name?: string;
        enabled?: boolean;
        gain?: number;
    }>;
    anchorTick: number;
    sourceTrackOrder: string[];
};

export interface PreparedMidiClipPaste {
    midiCache?: Array<{ key: string; value: TimelineMidiCacheEntry }>;
    clips: Array<{
        trackId: string;
        clip: Omit<MidiClip, 'type'> & { type?: 'midi' };
    }>;
    createTracks: Array<{ trackId: string; name: string; index?: number }>;
}

export interface PreparedTimelineClipPaste {
    midiCache?: Array<{ key: string; value: TimelineMidiCacheEntry }>;
    audioCache?: Array<{ key: string; value: AudioCacheEntry }>;
    midiClips: PreparedMidiClipPaste['clips'];
    audioClips: Array<{
        trackId: string;
        clip: Omit<AudioClip, 'type'> & { type?: 'audio' };
    }>;
    createMidiTracks: PreparedMidiClipPaste['createTracks'];
    createAudioTracks: Array<{ trackId: string; name: string; index?: number }>;
}

let clipboard: TimelineClipClipboard | null = null;

export function getMidiClipClipboard(): MidiClipClipboard | null {
    if (!clipboard) return null;
    const midiClips = clipboard.clips.filter((clip) => clip.kind === 'midi');
    if (!midiClips.length) return null;
    return {
        kind: 'mvmnt.midi-clips',
        version: 1,
        sources: clipboard.midiSources,
        clips: midiClips.map(({ kind: _kind, gain: _gain, ...clip }) => clip),
        anchorTick: clipboard.anchorTick,
        sourceTrackOrder: clipboard.sourceTrackOrder,
    };
}

export function setMidiClipClipboard(next: MidiClipClipboard | null): void {
    clipboard = next
        ? {
              kind: 'mvmnt.timeline-clips',
              version: 1,
              midiSources: next.sources,
              clips: next.clips.map((clip) => ({ ...clip, kind: 'midi' })),
              anchorTick: next.anchorTick,
              sourceTrackOrder: next.sourceTrackOrder,
          }
        : null;
}

export function getTimelineClipClipboard(): TimelineClipClipboard | null {
    return clipboard;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA < endB && endA > startB;
}

export function getMidiClipsInTimelineSelection(
    state: TimelineState,
    selection: ClipTimelineSelection | null
): TimelineClipRef[] {
    if (!selection) return [];
    if (selection.type === 'clips') {
        return selection.clips.filter((ref) => (ref.kind ?? state.tracks[ref.trackId]?.type) === 'midi');
    }
    if (selection.type !== 'range') return [];
    const refs: TimelineClipRef[] = [];
    const selectedTrackIds = new Set(selection.range.trackIds);
    const startTick = Math.min(selection.range.startTick, selection.range.endTick);
    const endTick = Math.max(selection.range.startTick, selection.range.endTick);
    for (const trackId of state.tracksOrder) {
        if (!selectedTrackIds.has(trackId)) continue;
        const track = state.tracks[trackId];
        if (!track || track.type !== 'midi') continue;
        for (const clip of getMidiClipsForTrack(track)) {
            if (clip.enabled === false) continue;
            const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
            if (!bounds) continue;
            if (rangesOverlap(startTick, endTick, bounds.startTick, bounds.endTick)) {
                refs.push({ trackId, clipId: clip.id, kind: 'midi' });
            }
        }
    }
    return refs;
}

export function getAudioClipsInTimelineSelection(
    state: TimelineState,
    selection: ClipTimelineSelection | null
): TimelineClipRef[] {
    if (!selection) return [];
    if (selection.type === 'clips') {
        return selection.clips.filter((ref) => (ref.kind ?? state.tracks[ref.trackId]?.type) === 'audio');
    }
    if (selection.type !== 'range') return [];
    const refs: TimelineClipRef[] = [];
    const selectedTrackIds = new Set(selection.range.trackIds);
    const timing = createTimingContext(state.timeline);
    const startTick = Math.min(selection.range.startTick, selection.range.endTick);
    const endTick = Math.max(selection.range.startTick, selection.range.endTick);
    for (const trackId of state.tracksOrder) {
        if (!selectedTrackIds.has(trackId)) continue;
        const track = state.tracks[trackId];
        if (!track || track.type !== 'audio') continue;
        for (const clip of getAudioClipsForTrack(track)) {
            if (clip.enabled === false) continue;
            const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
            if (!bounds) continue;
            if (rangesOverlap(startTick, endTick, bounds.startTick, bounds.endTick)) {
                refs.push({ trackId, clipId: clip.id, kind: 'audio' });
            }
        }
    }
    return refs;
}

export function getTimelineClipsInSelection(
    state: TimelineState,
    selection: ClipTimelineSelection | null
): TimelineClipRef[] {
    return [
        ...getMidiClipsInTimelineSelection(state, selection),
        ...getAudioClipsInTimelineSelection(state, selection),
    ].sort((a, b) => state.tracksOrder.indexOf(a.trackId) - state.tracksOrder.indexOf(b.trackId));
}

export function copyTimelineSelectionToMidiClipClipboard(
    state: TimelineState,
    selection: ClipTimelineSelection | null
): MidiClipClipboard | null {
    const copied: MidiClipClipboard['clips'] = [];
    const copiedSources = new Map<string, TimelineMidiCacheEntry>();
    const selectedKeys = new Set(
        getMidiClipsInTimelineSelection(state, selection).map((entry) => `${entry.trackId}:${entry.clipId}`)
    );
    for (const trackId of state.tracksOrder) {
        const track = state.tracks[trackId];
        if (!track || track.type !== 'midi') continue;
        for (const clip of getMidiClipsForTrack(track)) {
            if (!selectedKeys.has(`${trackId}:${clip.id}`)) continue;
            const sourceCache = state.midiCache[clip.sourceId];
            if (!sourceCache) continue;
            copiedSources.set(clip.sourceId, sourceCache);
            copied.push({
                sourceTrackId: trackId,
                sourceClipId: clip.id,
                sourceId: clip.sourceId,
                offsetTicks: clip.offsetTicks,
                regionStartTick: clip.regionStartTick,
                regionEndTick: clip.regionEndTick,
                name: clip.name,
                enabled: clip.enabled,
            });
        }
    }
    if (!copied.length) {
        setMidiClipClipboard(null);
        return null;
    }
    const sourceTrackOrder = state.tracksOrder.filter((trackId) =>
        copied.some((clip) => clip.sourceTrackId === trackId)
    );
    const anchorTick = Math.min(...copied.map((clip) => clip.offsetTicks));
    const payload: MidiClipClipboard = {
        kind: 'mvmnt.midi-clips',
        version: 1,
        sources: [...copiedSources].map(([sourceId, cache]) => ({ sourceId, cache })),
        clips: copied,
        anchorTick,
        sourceTrackOrder,
    };
    setMidiClipClipboard(payload);
    return payload;
}

export function copyTimelineSelectionToClipboard(
    state: TimelineState,
    selection: ClipTimelineSelection | null
): TimelineClipClipboard | null {
    const copied: TimelineClipClipboard['clips'] = [];
    const copiedMidiSources = new Map<string, TimelineMidiCacheEntry>();
    const copiedAudioSources = new Map<string, AudioCacheEntry>();
    const selectedKeys = new Set(
        getTimelineClipsInSelection(state, selection).map((entry) => `${entry.trackId}:${entry.clipId}`)
    );
    for (const trackId of state.tracksOrder) {
        const track = state.tracks[trackId];
        if (!track) continue;
        if (track.type === 'midi') {
            for (const clip of getMidiClipsForTrack(track)) {
                if (!selectedKeys.has(`${trackId}:${clip.id}`)) continue;
                const sourceCache = state.midiCache[clip.sourceId];
                if (!sourceCache) continue;
                copiedMidiSources.set(clip.sourceId, sourceCache);
                copied.push({
                    kind: 'midi',
                    sourceTrackId: trackId,
                    sourceClipId: clip.id,
                    sourceId: clip.sourceId,
                    offsetTicks: clip.offsetTicks,
                    regionStartTick: clip.regionStartTick,
                    regionEndTick: clip.regionEndTick,
                    name: clip.name,
                    enabled: clip.enabled,
                });
            }
        } else if (track.type === 'audio') {
            for (const clip of getAudioClipsForTrack(track)) {
                if (!selectedKeys.has(`${trackId}:${clip.id}`)) continue;
                const sourceCache = state.audioCache[clip.sourceId];
                if (!sourceCache) continue;
                copiedAudioSources.set(clip.sourceId, sourceCache);
                copied.push({
                    kind: 'audio',
                    sourceTrackId: trackId,
                    sourceClipId: clip.id,
                    sourceId: clip.sourceId,
                    offsetTicks: clip.offsetTicks,
                    sourceStartSeconds: clip.sourceStartSeconds,
                    sourceEndSeconds: clip.sourceEndSeconds,
                    name: clip.name,
                    enabled: clip.enabled,
                    gain: clip.gain,
                });
            }
        }
    }
    if (!copied.length) {
        clipboard = null;
        return null;
    }
    const payload: TimelineClipClipboard = {
        kind: 'mvmnt.timeline-clips',
        version: 1,
        midiSources: [...copiedMidiSources].map(([sourceId, cache]) => ({ sourceId, cache })),
        audioSources: [...copiedAudioSources].map(([sourceId, cache]) => ({ sourceId, cache })),
        clips: copied,
        anchorTick: Math.min(...copied.map((clip) => clip.offsetTicks)),
        sourceTrackOrder: state.tracksOrder.filter((trackId) => copied.some((clip) => clip.sourceTrackId === trackId)),
    };
    clipboard = payload;
    return payload;
}

/**
 * Finds the timeline destination for duplicating a copied clip selection.
 *
 * MIDI clip offsets refer to the source timeline origin, while the rendered
 * clip begins at the source's first MIDI event. Account for that local start
 * so the visible duplicate begins at the visible end of the selection.
 */
export function getTimelineClipDuplicateDestination(
    state: TimelineState,
    payload: TimelineClipClipboard,
): { tick: number; trackId: string } | null {
    if (!payload.clips.length) return null;

    const trackId = state.tracksOrder.find((id) =>
        payload.sourceTrackOrder.includes(id) && Boolean(state.tracks[id])
    );
    if (!trackId) return null;

    let maxEndTick = -Infinity;
    let minMidiStartTick = Infinity;
    let midiOnly = true;

    for (const copiedClip of payload.clips) {
        const track = state.tracks[copiedClip.sourceTrackId];
        if (copiedClip.kind === 'midi') {
            const clip = track?.type === 'midi'
                ? getMidiClipsForTrack(track).find((entry) => entry.id === copiedClip.sourceClipId)
                : undefined;
            const bounds = clip ? getMidiClipTimelineBounds(state.midiCache, clip) : null;
            if (!bounds) continue;
            maxEndTick = Math.max(maxEndTick, bounds.endTick);
            minMidiStartTick = Math.min(minMidiStartTick, bounds.startTick);
            continue;
        }

        midiOnly = false;
        const clip = track?.type === 'audio'
            ? getAudioClipsForTrack(track).find((entry) => entry.id === copiedClip.sourceClipId)
            : undefined;
        const bounds = clip ? getAudioClipTimelineBounds(state.audioCache, clip, createTimingContext(state.timeline)) : null;
        if (bounds) maxEndTick = Math.max(maxEndTick, bounds.endTick);
    }

    if (!Number.isFinite(maxEndTick)) return null;

    return {
        trackId,
        tick: midiOnly && Number.isFinite(minMidiStartTick)
            ? Math.max(0, Math.round(maxEndTick - (minMidiStartTick - payload.anchorTick)))
            : Math.round(maxEndTick),
    };
}

export function prepareMidiClipPaste(
    state: TimelineState,
    payload: MidiClipClipboard,
    destination: { tick: number; trackId: string }
): PreparedMidiClipPaste | null {
    if (!payload || payload.kind !== 'mvmnt.midi-clips' || payload.version !== 1 || !payload.clips.length) {
        return null;
    }
    const midiTrackIds = state.tracksOrder.filter((trackId) => state.tracks[trackId]?.type === 'midi');
    const destinationTrackIndex = midiTrackIds.indexOf(destination.trackId);
    if (destinationTrackIndex < 0) return null;

    const sourceTrackOrder = payload.sourceTrackOrder.length
        ? payload.sourceTrackOrder
        : [...new Set(payload.clips.map((clip) => clip.sourceTrackId))];
    const trackMap = new Map<string, string>();
    const createTracks: PreparedMidiClipPaste['createTracks'] = [];
    const baseOrderIndex = state.tracksOrder.indexOf(destination.trackId);
    const sourceCache = new Map((payload.sources ?? []).map((entry) => [entry.sourceId, entry.cache] as const));
    const missingSourceCache = [...sourceCache]
        .filter(([sourceId]) => !state.midiCache[sourceId])
        .map(([key, value]) => ({ key, value }));

    sourceTrackOrder.forEach((sourceTrackId, sourceIndex) => {
        const existingDestination = midiTrackIds[destinationTrackIndex + sourceIndex];
        if (existingDestination) {
            trackMap.set(sourceTrackId, existingDestination);
            return;
        }
        const sourceTrack = state.tracks[sourceTrackId];
        const trackId = `trk_paste_${makeMidiClipId()}`;
        trackMap.set(sourceTrackId, trackId);
        createTracks.push({
            trackId,
            name: sourceTrack?.type === 'midi' ? `${sourceTrack.name} copy` : 'MIDI Track',
            index: baseOrderIndex + sourceIndex,
        });
    });

    const clips = payload.clips
        .map((clip) => {
            const targetTrackId = trackMap.get(clip.sourceTrackId);
            if (!targetTrackId || (!state.midiCache[clip.sourceId] && !sourceCache.has(clip.sourceId))) return null;
            return {
                trackId: targetTrackId,
                clip: {
                    id: makeMidiClipId(),
                    type: 'midi' as const,
                    sourceId: clip.sourceId,
                    offsetTicks: Math.max(0, Math.round(destination.tick + (clip.offsetTicks - payload.anchorTick))),
                    regionStartTick: clip.regionStartTick,
                    regionEndTick: clip.regionEndTick,
                    name: clip.name,
                    enabled: clip.enabled,
                },
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!clips.length) return null;
    return { clips, createTracks, midiCache: missingSourceCache.length ? missingSourceCache : undefined };
}

function buildTrackMap(params: {
    state: TimelineState;
    payload: TimelineClipClipboard;
    destination: { tick: number; trackId: string };
    kind: 'midi' | 'audio';
}): { trackMap: Map<string, string>; createTracks: Array<{ trackId: string; name: string; index?: number }> } | null {
    const { state, payload, destination, kind } = params;
    const destinationTrackIds = state.tracksOrder.filter((trackId) => state.tracks[trackId]?.type === kind);
    const destinationTrackIndex = destinationTrackIds.indexOf(destination.trackId);
    if (destinationTrackIndex < 0) return null;
    const sourceTrackOrder = payload.sourceTrackOrder.filter((trackId) =>
        payload.clips.some((clip) => clip.kind === kind && clip.sourceTrackId === trackId)
    );
    const trackMap = new Map<string, string>();
    const createTracks: Array<{ trackId: string; name: string; index?: number }> = [];
    const baseOrderIndex = state.tracksOrder.indexOf(destination.trackId);
    sourceTrackOrder.forEach((sourceTrackId, sourceIndex) => {
        const existingDestination = destinationTrackIds[destinationTrackIndex + sourceIndex];
        if (existingDestination) {
            trackMap.set(sourceTrackId, existingDestination);
            return;
        }
        const sourceTrack = state.tracks[sourceTrackId];
        const trackId = kind === 'midi' ? `trk_paste_${makeMidiClipId()}` : `aud_paste_${makeAudioClipId()}`;
        trackMap.set(sourceTrackId, trackId);
        createTracks.push({
            trackId,
            name: sourceTrack?.type === kind ? `${sourceTrack.name} copy` : kind === 'midi' ? 'MIDI Track' : 'Audio Track',
            index: baseOrderIndex + sourceIndex,
        });
    });
    return { trackMap, createTracks };
}

export function prepareTimelineClipPaste(
    state: TimelineState,
    payload: TimelineClipClipboard,
    destination: { tick: number; trackId: string }
): PreparedTimelineClipPaste | null {
    if (!payload || payload.kind !== 'mvmnt.timeline-clips' || payload.version !== 1 || !payload.clips.length) {
        return null;
    }
    const destinationKind = state.tracks[destination.trackId]?.type;
    if (destinationKind !== 'midi' && destinationKind !== 'audio') return null;

    const midiSources = new Map((payload.midiSources ?? []).map((entry) => [entry.sourceId, entry.cache] as const));
    const audioSources = new Map((payload.audioSources ?? []).map((entry) => [entry.sourceId, entry.cache] as const));
    const missingMidiCache = [...midiSources]
        .filter(([sourceId]) => !state.midiCache[sourceId])
        .map(([key, value]) => ({ key, value }));
    const missingAudioCache = [...audioSources]
        .filter(([sourceId]) => !state.audioCache[sourceId])
        .map(([key, value]) => ({ key, value }));
    const timing = createTimingContext(state.timeline);
    const audioAnchorStartSeconds = Math.min(
        ...payload.clips
            .filter((clip) => clip.kind === 'audio')
            .map((clip) => {
                const source = getAudioClipSourceBounds(
                    { ...state.audioCache, ...Object.fromEntries(audioSources) },
                    clip as unknown as AudioClip,
                );
                return ticksToSeconds(timing, clip.offsetTicks) + (source?.startSeconds ?? 0);
            }),
    );

    const midiMap = payload.clips.some((clip) => clip.kind === 'midi')
        ? buildTrackMap({ state, payload, destination, kind: destinationKind === 'midi' ? 'midi' : 'midi' })
        : null;
    const audioMap = payload.clips.some((clip) => clip.kind === 'audio')
        ? buildTrackMap({ state, payload, destination, kind: destinationKind === 'audio' ? 'audio' : 'audio' })
        : null;

    const midiClips = payload.clips
        .filter((clip) => clip.kind === 'midi')
        .map((clip) => {
            const targetTrackId = midiMap?.trackMap.get(clip.sourceTrackId);
            if (!targetTrackId || (!state.midiCache[clip.sourceId] && !midiSources.has(clip.sourceId))) return null;
            return {
                trackId: targetTrackId,
                clip: {
                    id: makeMidiClipId(),
                    type: 'midi' as const,
                    sourceId: clip.sourceId,
                    offsetTicks: Math.max(0, Math.round(destination.tick + (clip.offsetTicks - payload.anchorTick))),
                    regionStartTick: clip.regionStartTick,
                    regionEndTick: clip.regionEndTick,
                    name: clip.name,
                    enabled: clip.enabled,
                },
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const audioClips = payload.clips
        .filter((clip) => clip.kind === 'audio')
        .map((clip) => {
            const targetTrackId = audioMap?.trackMap.get(clip.sourceTrackId);
            if (!targetTrackId || (!state.audioCache[clip.sourceId] && !audioSources.has(clip.sourceId))) return null;
            const sourceBounds = getAudioClipSourceBounds(
                { ...state.audioCache, ...Object.fromEntries(audioSources) },
                clip as unknown as AudioClip,
            );
            const sourceStartSeconds = sourceBounds?.startSeconds ?? clip.sourceStartSeconds ?? 0;
            const originalVisualStartSeconds = ticksToSeconds(timing, clip.offsetTicks) + sourceStartSeconds;
            const destinationVisualStartSeconds = ticksToSeconds(timing, destination.tick) +
                (Number.isFinite(audioAnchorStartSeconds) ? originalVisualStartSeconds - audioAnchorStartSeconds : 0);
            return {
                trackId: targetTrackId,
                clip: {
                    id: makeAudioClipId(),
                    type: 'audio' as const,
                    sourceId: clip.sourceId,
                    offsetTicks: Math.max(0, Math.round(secondsToTicks(timing, destinationVisualStartSeconds - sourceStartSeconds))),
                    sourceStartSeconds: clip.sourceStartSeconds,
                    sourceEndSeconds: clip.sourceEndSeconds,
                    name: clip.name,
                    enabled: clip.enabled,
                    gain: clip.gain,
                },
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!midiClips.length && !audioClips.length) return null;
    return {
        midiClips,
        audioClips,
        createMidiTracks: midiMap?.createTracks ?? [],
        createAudioTracks: audioMap?.createTracks ?? [],
        midiCache: missingMidiCache.length ? missingMidiCache : undefined,
        audioCache: missingAudioCache.length ? missingAudioCache : undefined,
    };
}
