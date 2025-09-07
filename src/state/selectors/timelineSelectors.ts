import type { TimelineState, TimelineTrack } from '../timelineStore';

// Helpers: derive seconds offset from beats if needed using timeline context
const beatsToSeconds = (s: TimelineState, beats: number): number => {
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
    if (typeof t.offsetBeats === 'number') return beatsToSeconds(s, t.offsetBeats);
    return t.offsetSec || 0;
};

export const getTrackOffsetBeats = (s: TimelineState, id: string): number => {
    const t = s.tracks[id];
    if (!t) return 0;
    if (typeof t.offsetBeats === 'number') return t.offsetBeats;
    // derive from seconds
    const spbFallback = 60 / (s.timeline.globalBpm || 120);
    const sec = t.offsetSec || 0;
    return sec / spbFallback; // approximate without tempo map to avoid cycle
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

    const res: TimelineNoteEvent[] = [];
    for (const tid of args.trackIds) {
        const track = s.tracks[tid];
        if (!track || track.type !== 'midi' || !track.enabled || track.mute) continue;
        const cacheKey = track.midiSourceId ?? tid;
        const cache = s.midiCache[cacheKey];
        if (!cache) continue;

        const offset = getEffectiveOffsetSec(s, track);
        const rStart = track.regionStartSec ?? -Infinity;
        const rEnd = track.regionEndSec ?? Infinity;

        // Map timeline window -> track local seconds
        const localStart = Math.max(0, startSec - offset);
        const localEnd = Math.max(0, endSec - offset);

        for (const n of cache.notesRaw) {
            // Clip by track region in track-local time, then by window
            const ns = Math.max(n.startTime, rStart >= 0 ? rStart : 0);
            const ne = Math.min(n.endTime, isFinite(rEnd) ? rEnd : n.endTime);
            if (ns >= ne) continue;
            if (ne <= localStart || ns >= localEnd) continue;
            // Map to timeline seconds
            const ts = ns + offset;
            const te = ne + offset;
            res.push({
                trackId: tid,
                note: n.note,
                channel: n.channel,
                startTime: ts,
                endTime: te,
                duration: te - ts,
                velocity: n.velocity,
            });
        }
    }
    // Sort by start time for stable rendering
    res.sort((a, b) => a.startTime - b.startTime || a.note - b.note);
    return res;
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
            `${tid}:${t.enabled ? 1 : 0}${t.mute ? 1 : 0}:${getEffectiveOffsetSec(s, t)}:${t.regionStartSec ?? ''}:${
                t.regionEndSec ?? ''
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
