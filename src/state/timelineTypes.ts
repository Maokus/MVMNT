// Shared types for Timeline state that are needed outside the store implementation

export type TempoMapEntry = { time: number; tempo: number }; // time in seconds, tempo in microseconds per quarter

export interface NoteRaw {
    note: number;
    channel: number;
    startTime: number; // seconds
    endTime: number; // seconds
    duration: number; // seconds
    startTick?: number;
    endTick?: number;
    startBeat?: number;
    endBeat?: number;
    velocity?: number;
}
