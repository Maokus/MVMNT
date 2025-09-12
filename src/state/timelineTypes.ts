// Shared types for Timeline state that are needed outside the store implementation
export type { TempoMapEntry } from '@core/timing/types';

export interface NoteRaw {
    note: number;
    channel: number;
    // Real-time values are derived from beats (if beat info present) so they update when tempo changes
    startTime: number; // seconds (derived)
    endTime: number; // seconds (derived)
    duration: number; // seconds (derived)
    startTick?: number;
    endTick?: number;
    // Canonical musical time positions (beats from beginning). If present they are source of truth.
    startBeat?: number;
    endBeat?: number;
    durationBeats?: number; // convenience, if startBeat/endBeat present
    velocity?: number;
}
