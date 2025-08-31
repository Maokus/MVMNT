import type { TimelineState, TimelineTrack } from '../timelineStore';

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

        const offset = track.offsetSec || 0;
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
