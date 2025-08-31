import { TimingManager } from './timing-manager';
import { beatsToSecondsWithMap, secondsToBeatsWithMap } from './tempo-utils';
import type { MIDIData, MIDIEvent } from '@core/types';
import type { Timeline, TimelineTrack, TimelineMidiTrack, TempoMapEntry } from './timeline';

type NoteLike = {
    startTick?: number;
    endTick?: number;
    startBeat?: number;
    endBeat?: number;
    startTime?: number;
    endTime?: number;
    note: number;
    velocity: number;
    channel: number;
    duration?: number;
};

export class TimelineService {
    private timeline: Timeline;
    private timing: TimingManager; // used for default secondsPerBeat and utilities

    constructor(name = 'Timeline') {
        this.timing = new TimingManager('timeline');
        this.timeline = {
            id: Math.random().toString(36).slice(2),
            name,
            tracks: [],
            currentTimeSec: 0,
        };
    }

    // Timeline accessors
    getTimeline(): Timeline {
        return this.timeline;
    }
    setMasterTempoMap(map: TempoMapEntry[] | undefined) {
        this.timeline.masterTempoMap = map;
    }

    // Track management
    async addMidiTrack({
        file,
        midiData,
        name,
        offsetSec = 0,
    }: {
        file?: File;
        midiData?: MIDIData;
        name?: string;
        offsetSec?: number;
    }): Promise<string> {
        if (!midiData && !file) throw new Error('addMidiTrack requires midiData or file');
        const id = Math.random().toString(36).slice(2);
        const createTrack = (data: MIDIData): TimelineMidiTrack => {
            // Build notesRaw from events
            const notes: NoteLike[] = [];
            const noteOnMap = new Map<string, MIDIEvent>();
            for (const ev of data.events) {
                if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
                    const key = `${ev.note}_${ev.channel || 0}`;
                    noteOnMap.set(key, ev);
                } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
                    const key = `${ev.note}_${ev.channel || 0}`;
                    const on = noteOnMap.get(key);
                    if (on) {
                        notes.push({
                            note: on.note!,
                            channel: on.channel || 0,
                            velocity: on.velocity || 0,
                            startTime: on.time,
                            endTime: ev.time,
                            startTick: on.tick,
                            endTick: ev.tick,
                            duration: ev.time - on.time,
                        });
                        noteOnMap.delete(key);
                    }
                }
            }
            // Remaining noteOns (no off): assume 1s
            noteOnMap.forEach((on) => {
                notes.push({
                    note: on.note!,
                    channel: on.channel || 0,
                    velocity: on.velocity || 0,
                    startTime: on.time,
                    endTime: (on.time || 0) + 1,
                    startTick: on.tick,
                    duration: 1,
                });
            });

            const track: TimelineMidiTrack = {
                id,
                name: name || data.fileName || 'MIDI Track',
                type: 'midi',
                offsetSec,
                enabled: true,
                mute: false,
                solo: false,
                ticksPerQuarter: data.ticksPerQuarter,
                tempoMap: (data as any).tempoMap as TempoMapEntry[] | undefined,
                midiData: data,
                notesRaw: notes,
            };
            return track;
        };

        if (midiData) {
            const track = createTrack(midiData);
            this.timeline.tracks.push(track);
            return id;
        }

        // File ingestion path using midi-library
        const { parseMIDIFileToData } = await import('../midi/midi-library');
        const parsed = await parseMIDIFileToData(file as File);
        const track = createTrack(parsed);
        this.timeline.tracks.push(track);
        return id;
    }

    getTracks(): TimelineTrack[] {
        return this.timeline.tracks.slice();
    }
    getTrack(id: string): TimelineTrack | undefined {
        return this.timeline.tracks.find((t) => t.id === id);
    }

    // Mapping helpers
    map = {
        timelineToTrackSeconds: (trackId: string, timelineSec: number): number | null => {
            const t = this.getTrack(trackId);
            if (!t || !t.enabled || t.mute) return null;
            const local = timelineSec - (t.offsetSec || 0);
            if (t.regionStartSec !== undefined && local < t.regionStartSec) return null;
            if (t.regionEndSec !== undefined && local > t.regionEndSec) return null;
            return Math.max(0, local);
        },
        trackBeatsToTimelineSeconds: (trackId: string, beats: number): number => {
            const t = this.getTrack(trackId) as TimelineMidiTrack | undefined;
            if (!t) return beats * this.timing.getSecondsPerBeat();
            const spb = this.timing.getSecondsPerBeat();
            const sec = beatsToSecondsWithMap(beats, t.tempoMap ?? this.timeline.masterTempoMap, spb);
            return sec + (t.offsetSec || 0);
        },
    };

    getNotesInWindow({
        trackIds,
        startSec,
        endSec,
    }: {
        trackIds: string[];
        startSec: number;
        endSec: number;
    }): Array<NoteLike & { trackId: string; startSec: number; endSec: number }> {
        const out: Array<NoteLike & { trackId: string; startSec: number; endSec: number }> = [];

        // Determine candidate tracks: if any tracks are soloed, restrict to those; otherwise all enabled & not muted.
        const allMidiTracks = this.timeline.tracks.filter((t): t is TimelineMidiTrack => t.type === 'midi');
        const soloed = allMidiTracks.filter((t) => t.solo);
        const allowedSet = new Set(
            (soloed.length > 0 ? soloed : allMidiTracks).filter((t) => t.enabled && !t.mute).map((t) => t.id)
        );

        // If trackIds is empty or undefined, treat as all allowed tracks
        const ids = (trackIds && trackIds.length > 0 ? trackIds : Array.from(allowedSet)).filter((id) =>
            allowedSet.has(id)
        );

        for (const id of ids) {
            const t = this.getTrack(id) as TimelineMidiTrack | undefined;
            if (!t || !t.enabled || t.mute) continue;

            // Compute local window by removing offset and clamping to track region if present
            let lo = startSec - (t.offsetSec || 0);
            let hi = endSec - (t.offsetSec || 0);
            if (t.regionStartSec !== undefined) lo = Math.max(lo, t.regionStartSec);
            if (t.regionEndSec !== undefined) hi = Math.min(hi, t.regionEndSec);
            if (!(hi > lo)) continue; // no overlap with track region/window

            const secondsPerBeat = this.timing.getSecondsPerBeat();
            const map = t.tempoMap ?? this.timeline.masterTempoMap;

            for (const n of t.notesRaw) {
                // Resolve note times in local (track) seconds
                let s = n.startTime;
                let e = n.endTime ?? n.startTime;
                if (n.startBeat !== undefined) {
                    s = beatsToSecondsWithMap(n.startBeat, map, secondsPerBeat);
                }
                if (n.endBeat !== undefined) {
                    e = beatsToSecondsWithMap(n.endBeat, map, secondsPerBeat);
                }
                // Intersect with local window
                if (s! < hi && e! > lo) {
                    const off = t.offsetSec || 0;
                    out.push({
                        ...n,
                        startSec: (s as number) + off,
                        endSec: (e as number) + off,
                        trackId: id,
                    });
                }
            }
        }
        // Sort by start time for deterministic rendering/processing
        out.sort((a, b) => a.startSec - b.startSec);
        return out;
    }

    getNotesNearTimeUnit({ trackId, centerSec, bars = 1 }: { trackId: string; centerSec: number; bars?: number }) {
        const spb = this.timing.getSecondsPerBeat(centerSec);
        const bpb = this.timing.beatsPerBar;
        const totalBeats = secondsToBeatsWithMap(
            centerSec - (this.getTrack(trackId)?.offsetSec || 0),
            (this.getTrack(trackId) as TimelineMidiTrack | undefined)?.tempoMap ?? this.timeline.masterTempoMap,
            spb
        );
        const barIndex = Math.floor(totalBeats / bpb);
        const windowStartBeats = Math.floor(barIndex / bars) * bars * bpb;
        const windowEndBeats = windowStartBeats + bars * bpb;
        const startSec = this.map.trackBeatsToTimelineSeconds(trackId, windowStartBeats);
        const endSec = this.map.trackBeatsToTimelineSeconds(trackId, windowEndBeats);
        return this.getNotesInWindow({ trackIds: [trackId], startSec, endSec });
    }

    crossSync = {
        align: ({
            fromTrackId,
            toTrackId,
            timeInFromTrack,
        }: {
            fromTrackId: string;
            toTrackId: string;
            timeInFromTrack: number;
        }) => {
            // Convert from local seconds to beats in fromTrack, then to timeline seconds via toTrack
            const from = this.getTrack(fromTrackId) as TimelineMidiTrack | undefined;
            const to = this.getTrack(toTrackId) as TimelineMidiTrack | undefined;
            if (!from || !to) return timeInFromTrack;
            const spb = this.timing.getSecondsPerBeat();
            const beats = secondsToBeatsWithMap(timeInFromTrack, from.tempoMap ?? this.timeline.masterTempoMap, spb);
            return this.map.trackBeatsToTimelineSeconds(toTrackId, beats);
        },
    };
}
