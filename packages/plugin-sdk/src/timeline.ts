import type { Result } from './api.js';

export interface TimelineMetadata {
    readonly durationSeconds: number;
    readonly playbackStartSeconds: number;
    readonly playbackEndSeconds: number;
    readonly tempoBpm: number;
    readonly timeSignature: Readonly<{ numerator: number; denominator: number }>;
}

export interface TrackSummary {
    readonly id: string;
    readonly name: string;
    readonly type: 'midi' | 'audio' | 'automation' | 'unknown';
    readonly muted: boolean;
    readonly color?: string;
}

export interface MidiNoteEvent {
    readonly trackId: string;
    readonly channel: number;
    readonly note: number;
    readonly velocity?: number;
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly durationSeconds: number;
    readonly clipId?: string;
    readonly sourceId?: string;
}

export interface MidiCCEvent {
    readonly trackId: string;
    readonly channel: number;
    readonly controller: number;
    readonly value: number;
    readonly timeSeconds: number;
    readonly clipId?: string;
    readonly sourceId?: string;
}

export interface TimelineApi {
    getMetadata(): Result<TimelineMetadata>;
    getTrack(trackId: string): Result<TrackSummary>;
    getTracks(trackIds?: readonly string[]): Result<readonly TrackSummary[]>;
    selectNotes(
        args: Readonly<{ trackIds?: readonly string[]; startSeconds: number; endSeconds: number }>
    ): Result<readonly MidiNoteEvent[]>;
    selectCC(
        args: Readonly<{ trackIds?: readonly string[]; controller?: number; startSeconds: number; endSeconds: number }>
    ): Result<readonly MidiCCEvent[]>;
    getSustain(args: Readonly<{ trackIds?: readonly string[]; timeSeconds: number }>): Result<boolean>;
}

/** Standalone adapters for authors who prefer named imports over method calls. */
export const getTimelineMetadata = (timeline: TimelineApi): ReturnType<TimelineApi['getMetadata']> =>
    timeline.getMetadata();

export const getTimelineTrack = (timeline: TimelineApi, trackId: string): ReturnType<TimelineApi['getTrack']> =>
    timeline.getTrack(trackId);

export const getTimelineTracks = (
    timeline: TimelineApi,
    trackIds?: readonly string[]
): ReturnType<TimelineApi['getTracks']> => timeline.getTracks(trackIds);

export const selectTimelineNotes = (
    timeline: TimelineApi,
    args: Parameters<TimelineApi['selectNotes']>[0]
): ReturnType<TimelineApi['selectNotes']> => timeline.selectNotes(args);

export const selectTimelineCC = (
    timeline: TimelineApi,
    args: Parameters<TimelineApi['selectCC']>[0]
): ReturnType<TimelineApi['selectCC']> => timeline.selectCC(args);

export const getTimelineSustain = (
    timeline: TimelineApi,
    args: Parameters<TimelineApi['getSustain']>[0]
): ReturnType<TimelineApi['getSustain']> => timeline.getSustain(args);
