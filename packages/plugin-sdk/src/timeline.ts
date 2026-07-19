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
  selectNotes(args: Readonly<{ trackIds?: readonly string[]; startSeconds: number; endSeconds: number }>): Result<readonly MidiNoteEvent[]>;
  selectCC(args: Readonly<{ trackIds?: readonly string[]; controller?: number; startSeconds: number; endSeconds: number }>): Result<readonly MidiCCEvent[]>;
  getSustain(args: Readonly<{ trackIds?: readonly string[]; timeSeconds: number }>): Result<boolean>;
}
