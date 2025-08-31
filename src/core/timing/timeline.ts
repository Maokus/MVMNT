import type { MIDIData } from '@core/types';

export type TempoMapEntry = { time: number; tempo?: number; bpm?: number };

export interface Timeline {
    id: string;
    name: string;
    masterTempoMap?: TempoMapEntry[];
    tracks: TimelineTrack[];
    currentTimeSec: number;
}

export type TimelineTrackType = 'midi' | 'audio';

export interface TimelineTrackBase {
    id: string;
    name: string;
    type: TimelineTrackType;
    offsetSec: number;
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    regionStartSec?: number;
    regionEndSec?: number;
}

export interface TimelineMidiTrack extends TimelineTrackBase {
    type: 'midi';
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
    midiData: MIDIData;
    notesRaw: Array<{
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
    }>;
}

export type TimelineTrack = TimelineMidiTrack; // audio later
