// Shared types for Timeline state that are needed outside the store implementation
export type { TempoMapEntry } from '@core/timing/types';

export interface NoteRaw {
    note: number;
    channel: number;
    // Canonical timing now in ticks (integer). These MUST be present post Phase 6.
    startTick: number; // inclusive
    endTick: number; // exclusive (or inclusive depending on upstream MIDI semantics; treat as end boundary)
    durationTicks: number; // cached = endTick - startTick (>=0)
    // Optional musical domain (beats) retained for convenience; if provided they are derived from ticks/PPQ.
    startBeat?: number;
    endBeat?: number;
    durationBeats?: number; // convenience (endBeat - startBeat)
    velocity?: number;
    // Deprecated (Phase 6): real-time seconds removed from canonical type. Any legacy code should derive via selectors.
    // startTime?: number; endTime?: number; duration?: number;
}
