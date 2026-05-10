// Shared types for Timeline state that are needed outside the store implementation
export type { TempoMapEntry } from '@core/timing/types';

export interface NoteRaw {
    note: number;
    channel: number;
    // Canonical timing in ticks (integer). These MUST be present.
    startTick: number; // inclusive
    endTick: number; // exclusive (or inclusive depending on upstream MIDI semantics; treat as end boundary)
    durationTicks: number; // cached = endTick - startTick (>=0)
    // Optional musical domain (beats) retained for convenience; if provided they are derived from ticks/PPQ.
    startBeat?: number;
    endBeat?: number;
    durationBeats?: number; // convenience (endBeat - startBeat)
    velocity?: number;
    // Real-time seconds removed from canonical type. Derive via selectors when needed.
    // startTime?: number; endTime?: number; duration?: number;
}

/** Raw CC event stored in ticks, before seconds conversion. */
export interface CCEventRaw {
    channel: number;
    controller: number;
    value: number;
    tick: number;
}

/** Pre-computed bounds for a MIDI cache entry. Populated by ingestMidiToCache when notes are sorted. */
export interface MidiCacheBounds {
    minTick: number;
    maxTick: number;
    minNote: number;
    maxNote: number;
    maxDurationTicks: number;
}
