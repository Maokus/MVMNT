import type { TimelineState, TimelineTrack } from '../timelineStore';
import { beatsToSeconds as convertBeatsToSeconds, secondsToBeats } from '@core/timing/tempo-utils';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { offsetTicksToBeats } from '@core/timing/offset-utils';
import type { TimelineNoteEvent, TimelineCCEvent } from '@core/timing/types';

export type { TimelineNoteEvent };
export type { TimelineCCEvent };

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

export const getTrackOffsetSeconds = (s: TimelineState, t: TimelineTrack): number => {
    // Convert canonical tick offset to seconds (no legacy offsetSec/offsetBeats fields remain)
    const beats = offsetTicksToBeats(t.offsetTicks || 0);
    return convertBeatsToSeconds(s.timeline.masterTempoMap, beats, 60 / (s.timeline.globalBpm || 120));
};

// getTrackOffsetBeats retained for convenience; canonical source is offsetTicks.
export const getTrackOffsetBeats = (s: TimelineState, id: string): number => {
    const t = s.tracks[id];
    if (!t) return 0;
    return offsetTicksToBeats(t.offsetTicks || 0);
};

export const selectMidiTracks = (s: TimelineState): TimelineTrack[] =>
    Object.values(s.tracks).filter((t): t is TimelineTrack => Boolean(t) && t.type === 'midi');

export const selectTrackById = (s: TimelineState, id: string | undefined | null): TimelineTrack | undefined => {
    if (!id) return undefined;
    const track = s.tracks[id];
    return track && track.type === 'midi' ? track : undefined;
};

export const selectTracksByIds = (s: TimelineState, ids: string[]): TimelineTrack[] =>
    ids.map((id) => s.tracks[id]).filter((track): track is TimelineTrack => Boolean(track) && track.type === 'midi');

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
        const offsetSec = getTrackOffsetSeconds(s, track);
        const regionStartTick = track.regionStartTick ?? 0;
        const regionEndTick = track.regionEndTick ?? Number.POSITIVE_INFINITY;
        // Convert window to track-local seconds
        const localStartSec = Math.max(0, startSec - offsetSec);
        const localEndSec = Math.max(0, endSec - offsetSec);
        const notesRaw = cache.notesRaw;
        // Binary search for start index when cache is sorted (bounds present)
        let startIdx = 0;
        if (cache.bounds && notesRaw.length > 32) {
            const localStartBeats = secondsToBeats(s.timeline.masterTempoMap, Math.max(0, localStartSec), spbFallback);
            const searchStartTick = Math.max(
                0,
                Math.round(localStartBeats * CANONICAL_PPQ) - cache.bounds.maxDurationTicks
            );
            let lo = 0,
                hi = notesRaw.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (notesRaw[mid].startTick < searchStartTick) lo = mid + 1;
                else hi = mid;
            }
            startIdx = lo;
        }
        for (let i = startIdx; i < notesRaw.length; i++) {
            const n = notesRaw[i];
            const startBeat = n.startBeat !== undefined ? n.startBeat : n.startTick / CANONICAL_PPQ;
            const endBeat = n.endBeat !== undefined ? n.endBeat : n.endTick / CANONICAL_PPQ;
            // Region clipping in tick space
            if (n.endTick <= regionStartTick || n.startTick >= regionEndTick) continue;
            const noteStartSec = convertBeatsToSeconds(s.timeline.masterTempoMap, startBeat, spbFallback);
            const noteEndSec = convertBeatsToSeconds(s.timeline.masterTempoMap, endBeat, spbFallback);
            const localStart = noteStartSec;
            const localEnd = noteEndSec;
            if (localEnd <= localStartSec || localStart >= localEndSec) {
                // When cache is sorted, notes starting after the window end cannot match: break early
                if (cache.bounds && localStart >= localEndSec) break;
                continue;
            }
            const timelineStartSec = localStart + offsetSec;
            const timelineEndSec = localEnd + offsetSec;
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

// Derive per-track notes (all) converted to seconds from tick domain on demand.
// Returns array of { startTime, endTime, duration } in timeline seconds (including track offset & region clipping)
export const selectNotesForTrackSeconds = (s: TimelineState, trackId: string): TimelineNoteEvent[] => {
    return selectNotesInWindow(s, { trackIds: [trackId], startSec: 0, endSec: Number.POSITIVE_INFINITY }).filter(
        (n) => n.trackId === trackId
    );
};

// Simple memoized variant: caches last inputs and result using shallow identity checks
let _lastArgs: { trackIdsKey: string; startSec: number; endSec: number } | null = null;

// Heavy selector: windowed CC events across tracks, mapped into timeline time domain
export const selectCCInWindow = (
    s: TimelineState,
    args: { trackIds?: string[]; controller?: number; startSec: number; endSec: number }
): TimelineCCEvent[] => {
    const { startSec, endSec } = args;
    const spbFallback = 60 / (s.timeline.globalBpm || 120);
    const res: TimelineCCEvent[] = [];
    const trackIds = args.trackIds ?? Object.keys(s.tracks).filter((id) => s.tracks[id]?.type === 'midi');
    if (trackIds.length === 0) return [];
    for (const tid of trackIds) {
        const track = s.tracks[tid];
        if (!track || track.type !== 'midi' || !track.enabled || track.mute) continue;
        const cacheKey = track.midiSourceId ?? tid;
        const cache = s.midiCache[cacheKey];
        if (!cache) continue;
        const ccRaw = cache.ccRaw ?? [];
        if (ccRaw.length === 0) continue;
        const offsetSec = getTrackOffsetSeconds(s, track);
        for (const cc of ccRaw) {
            if (args.controller !== undefined && cc.controller !== args.controller) continue;
            const beat = cc.tick / CANONICAL_PPQ;
            const ccTimeSec = convertBeatsToSeconds(s.timeline.masterTempoMap, beat, spbFallback) + offsetSec;
            if (ccTimeSec < startSec || ccTimeSec > endSec) continue;
            res.push({
                trackId: tid,
                channel: cc.channel,
                controller: cc.controller,
                value: cc.value,
                timeSec: ccTimeSec,
            });
        }
    }
    res.sort((a, b) => a.timeSec - b.timeSec);
    return res;
};

// Returns true if sustain pedal (CC 64) is held at the given time
export const selectSustainStateAtTime = (s: TimelineState, args: { trackIds?: string[]; timeSec: number }): boolean => {
    // Get all CC 64 events up to and including the target time
    const events = selectCCInWindow(s, {
        trackIds: args.trackIds,
        controller: 64,
        startSec: -Infinity,
        endSec: args.timeSec,
    });
    if (events.length === 0) return false;
    // Last event determines current state; value >= 64 = pedal down
    const last = events[events.length - 1];
    return last.value >= 64;
};

// Simple memoized variant for notes: caches last inputs and result using shallow identity checks
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
        if (!t || t.type !== 'midi') continue;
        const cacheKey = t.midiSourceId ?? tid;
        const cache = s.midiCache[cacheKey];
        const notesId = cache ? (cache.notesRaw as any) : null;
        depParts.push(
            `${tid}:${t.enabled ? 1 : 0}${t.mute ? 1 : 0}:${getTrackOffsetSeconds(s, t)}:${t.regionStartTick ?? ''}:$${
                t.regionEndTick ?? ''
            }:` +
                `${cache ? cache.ticksPerQuarter : ''}:${cache ? (cache.tempoMap?.length ?? 0) : ''}:${
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
