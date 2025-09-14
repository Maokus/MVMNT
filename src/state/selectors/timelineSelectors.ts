import type { TimelineState, TimelineTrack } from '../timelineStore';
import { beatsToSeconds as convertBeatsToSeconds } from '@core/timing/tempo-utils';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { offsetTicksToBeats } from '@core/timing/offset-utils';

// Helpers: derive seconds offset from beats if needed using timeline context
const _beatsToSecondsApprox = (s: TimelineState, beats: number): number => {
    const spbFallback = 60 / (s.timeline.globalBpm || 120);
    const map = s.timeline.masterTempoMap;
    // Avoid importing to prevent cycles; inline simple converter compatible with tempo-utils signature
    // We rely on tempo-utils in store; here we fallback to uniform tempo if map missing
    if (!map || map.length === 0) {
        return beats * spbFallback;
    }
    // Piecewise convert beats using map entries with cumulative beats->seconds ratio
    // Simplified: assume map entries are in seconds domain with bpm at that time; approximate
    // For selectors, approximation is acceptable; store is the source of truth for conversions.
    // We'll just use fallback to keep it deterministic here.
    return beats * spbFallback;
};

const getEffectiveOffsetSec = (s: TimelineState, t: TimelineTrack): number => {
    // Convert canonical tick offset to seconds (no legacy offsetSec/offsetBeats fields remain)
    const beats = offsetTicksToBeats(t.offsetTicks || 0);
    return convertBeatsToSeconds(s.timeline.masterTempoMap, beats, 60 / (s.timeline.globalBpm || 120));
};

export const getTrackOffsetBeats = (s: TimelineState, id: string): number => {
    const t = s.tracks[id];
    if (!t) return 0;
    return offsetTicksToBeats(t.offsetTicks || 0);
};

export const getTrackOffsetSeconds = (s: TimelineState, id: string): number => {
    const t = s.tracks[id];
    if (!t) return 0;
    return getEffectiveOffsetSec(s, t);
};

export type TimelineNoteEvent = {
    trackId: string;
    note: number;
    channel: number;
    startTime: number; // in timeline seconds
    endTime: number;
    duration: number;
    velocity?: number;
};

export const selectMidiTracks = (s: TimelineState): TimelineTrack[] =>
    Object.values(s.tracks).filter((t) => t.type === 'midi');

export const selectTrackById = (s: TimelineState, id: string | undefined | null): TimelineTrack | undefined =>
    id ? s.tracks[id] : undefined;

export const selectTracksByIds = (s: TimelineState, ids: string[]): TimelineTrack[] =>
    ids.map((id) => s.tracks[id]).filter(Boolean) as TimelineTrack[];

export const selectTransport = (s: TimelineState) => s.transport;
export const selectTimeline = (s: TimelineState) => s.timeline;
export const selectMidiCacheFor = (s: TimelineState, id: string | undefined | null) =>
    id ? s.midiCache[id] : undefined;

// Heavy selector: windowed notes across tracks, mapped into timeline time domain
export const selectNotesInWindow = (
    s: TimelineState,
    args: { trackIds: string[]; startSec: number; endSec: number }
): TimelineNoteEvent[] => {
    const { startSec, endSec } = args;
    if (args.trackIds.length === 0) return [];
    const spbFallback = 60 / (s.timeline.globalBpm || 120);
    const res: TimelineNoteEvent[] = [];
    for (const tid of args.trackIds) {
        const track = s.tracks[tid];
        if (!track || track.type !== 'midi' || !track.enabled || track.mute) continue;
        const cacheKey = track.midiSourceId ?? tid;
        const cache = s.midiCache[cacheKey];
        if (!cache) continue;
        const tpq = CANONICAL_PPQ; // normalized
        const offsetSec = getEffectiveOffsetSec(s, track);
        const regionStartTick = track.regionStartTick ?? 0;
        const regionEndTick = track.regionEndTick ?? Number.POSITIVE_INFINITY;
        // Convert window to track-local seconds
        const localStartSec = Math.max(0, startSec - offsetSec);
        const localEndSec = Math.max(0, endSec - offsetSec);
        for (const n of cache.notesRaw) {
            const startBeat = n.startBeat !== undefined ? n.startBeat : n.startTick / CANONICAL_PPQ;
            const endBeat = n.endBeat !== undefined ? n.endBeat : n.endTick / CANONICAL_PPQ;
            // Region clipping in tick space
            if (n.endTick <= regionStartTick || n.startTick >= regionEndTick) continue;
            const clippedStartTick = Math.max(n.startTick, regionStartTick);
            const clippedEndTick = Math.min(n.endTick, regionEndTick);
            const clippedStartBeat = clippedStartTick / CANONICAL_PPQ;
            const clippedEndBeat = clippedEndTick / CANONICAL_PPQ;
            const noteStartSec = convertBeatsToSeconds(s.timeline.masterTempoMap, startBeat, spbFallback);
            const noteEndSec = convertBeatsToSeconds(s.timeline.masterTempoMap, endBeat, spbFallback);
            const localStart = noteStartSec;
            const localEnd = noteEndSec;
            if (localEnd <= localStartSec || localStart >= localEndSec) continue;
            const clippedStartSec = Math.max(localStart, localStartSec);
            const clippedEndSec = Math.min(localEnd, localEndSec);
            const timelineStartSec = clippedStartSec + offsetSec;
            const timelineEndSec = clippedEndSec + offsetSec;
            res.push({
                trackId: tid,
                note: n.note,
                channel: n.channel,
                startTime: timelineStartSec,
                endTime: timelineEndSec,
                duration: Math.max(0, timelineEndSec - timelineStartSec),
                velocity: n.velocity,
            });
        }
    }
    res.sort((a, b) => a.startTime - b.startTime || a.note - b.note);
    return res;
};

// Phase 6: derive per-track notes (all) converted to seconds from tick domain on demand.
// Returns array of { startTime, endTime, duration } in timeline seconds (including track offset & region clipping)
export const selectNotesForTrackSeconds = (s: TimelineState, trackId: string): TimelineNoteEvent[] => {
    return selectNotesInWindow(s, { trackIds: [trackId], startSec: 0, endSec: Number.POSITIVE_INFINITY }).filter(
        (n) => n.trackId === trackId
    );
};

// Simple memoized variant: caches last inputs and result using shallow identity checks
let _lastArgs: { trackIdsKey: string; startSec: number; endSec: number } | null = null;
let _lastDepsKey: string | null = null;
let _lastResult: TimelineNoteEvent[] = [];

export const selectNotesInWindowMemo = (
    s: TimelineState,
    args: { trackIds: string[]; startSec: number; endSec: number }
): TimelineNoteEvent[] => {
    // Build a stable key for trackIds and window
    const trackIdsKey = args.trackIds.join('|');
    const baseKey = `${trackIdsKey}|${args.startSec}|${args.endSec}`;
    // Build a dependency key from track offsets/regions/enabled/mute and midi cache identities
    let depParts: string[] = [];
    for (const tid of args.trackIds) {
        const t = s.tracks[tid];
        if (!t) continue;
        const cacheKey = t.midiSourceId ?? tid;
        const cache = s.midiCache[cacheKey];
        const notesId = cache ? (cache.notesRaw as any) : null;
        depParts.push(
            `${tid}:${t.enabled ? 1 : 0}${t.mute ? 1 : 0}:${getEffectiveOffsetSec(s, t)}:${t.regionStartTick ?? ''}:$${
                t.regionEndTick ?? ''
            }:` +
                `${cache ? cache.ticksPerQuarter : ''}:${cache ? cache.tempoMap?.length ?? 0 : ''}:${
                    notesId ? (notesId as any).length : 0
                }`
        );
    }
    const depsKey = depParts.join('||');
    if (
        _lastArgs &&
        _lastArgs.trackIdsKey === trackIdsKey &&
        _lastArgs.startSec === args.startSec &&
        _lastArgs.endSec === args.endSec &&
        _lastDepsKey === depsKey
    ) {
        return _lastResult;
    }
    const res = selectNotesInWindow(s, args);
    _lastArgs = { trackIdsKey, startSec: args.startSec, endSec: args.endSec };
    _lastDepsKey = depsKey;
    _lastResult = res;
    return res;
};
