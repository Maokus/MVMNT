// Local NoteBlock class for Time Unit Piano Roll only
// Extends the core NoteEvent and adds time-window lifecycle logic, segmentation, and helpers
// Enhancements:
//  - Deterministic hash ids (noteId + baseNoteId) for referencing notes & segments during animation
//  - Segment flags & original timing retained for cross-window animation phases
//
// Additional metadata you may consider adding later (derivable or optional):
//  pitchClass (note % 12), octave (Math.floor(note / 12) - 1), frequencyHz
//  isBlackKey / isWhiteKey
//  programNumber / instrument / trackIndex
//  barIndex / beatIndex / onBeat (quantization helpers)
//  chordId / phraseId / motifId for grouping related notes
//  segmentIndex / segmentCount for multi-window segmentation chains
//  normalizedVelocity (velocity / 127)
//  articulation (staccato/legato) inferred from inter-onset spacing
//  colorOverride or paletteTag for theming logic
//  userData: Record<string, unknown> // arbitrary extension point
//  cachedGeometry: { x: number; y: number; w: number; h: number } // last frame layout (for tweening)
//  lifecycleTimestamps: { attackStart; decayStart; releaseStart; ... } // precomputed ADSR boundaries
// Only introduce when needed to avoid bloat.
import { NoteEvent } from '@core/midi/note-event';

export class NoteBlock extends NoteEvent {
    // For split/clamped segments (continuations between time units)
    public isSegment: boolean = false;
    public originalStartTime: number | null = null;
    public originalEndTime: number | null = null;

    // Time-unit window bounds for this segment
    public windowStart: number | null = null;
    public windowEnd: number | null = null;

    // Deterministic identifiers
    public noteId: string; // unique to this concrete block (segment-specific)
    public baseNoteId: string; // stable for all segments of the same underlying note

    constructor(note: number, channel: number, startTime: number, endTime: number, velocity: number) {
        super(note, channel, startTime, endTime, velocity);
        // Segment-specific id initially identical to base id; base id may be reassigned by builder
        this.noteId = NoteBlock.fastHashToHex(note, channel, startTime, endTime, velocity);
        this.baseNoteId = this.noteId; // can be overwritten after construction for segments
    }

    // Lightweight FNV-1a 32-bit hash (sufficiently fast & low collision for this usage)
    static fastHashToHex(...parts: Array<string | number>): string {
        let hash = 0x811c9dc5; // FNV offset basis
        for (const part of parts) {
            const str = String(part);
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                // 32-bit FNV prime mul with overflow
                hash = (hash >>> 0) * 0x01000193;
            }
        }
        // Final avalanche (optional lightweight mix)
        hash ^= hash >>> 13;
        hash ^= hash << 7;
        hash ^= hash >>> 17;
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    // Inherit constructor from NoteEvent

    // Utility used by NoteAnimations for glow effect
    isCurrentlyPlaying(currentTime: number): boolean {
        const start = this.originalStartTime ?? this.startTime;
        const end = this.originalEndTime ?? this.endTime;
        return start <= currentTime && end > currentTime;
    }

    // Build clamped segments for previous, current, and next time-unit windows
    // timingManager must implement getTimeUnitWindow(currentTime, timeUnitBars), _secondsToBeats, _beatsToSeconds, and beatsPerBar
    static buildWindowedSegments(
        notes: Array<{
            note: number;
            channel?: number;
            velocity: number;
            startTime: number;
            endTime: number;
            startBeat?: number;
            endBeat?: number;
        }>,
        timingManager: any,
        targetTime: number,
        timeUnitBars: number
    ): NoteBlock[] {
        const current = timingManager.getTimeUnitWindow(targetTime, timeUnitBars);
        const prevStart = timingManager._beatsToSeconds(
            timingManager._secondsToBeats(current.start) - timeUnitBars * (timingManager.beatsPerBar || 4)
        );
        const prev = { start: prevStart, end: current.start };
        const nextEnd = timingManager._beatsToSeconds(
            timingManager._secondsToBeats(current.end) + timeUnitBars * (timingManager.beatsPerBar || 4)
        );
        const next = { start: current.end, end: nextEnd };

        const minTime = prev.start;
        const maxTime = next.end;

        const candidateNotes = notes.filter((n) => {
            const s = n.startBeat !== undefined ? timingManager.beatsToSeconds(n.startBeat) : n.startTime;
            const e = n.endBeat !== undefined ? timingManager.beatsToSeconds(n.endBeat) : n.endTime;
            return s < maxTime && e > minTime;
        });

        const segments: NoteBlock[] = [];

        const addClipped = (note: any, win: { start: number; end: number }) => {
            const startTime =
                note.startBeat !== undefined ? timingManager.beatsToSeconds(note.startBeat) : note.startTime;
            const endTime = note.endBeat !== undefined ? timingManager.beatsToSeconds(note.endBeat) : note.endTime;
            if (startTime < win.end && endTime > win.start) {
                const segStart = Math.max(startTime, win.start);
                const segEnd = Math.min(endTime, win.end);
                const block = new NoteBlock(note.note, note.channel || 0, segStart, segEnd, note.velocity);
                if (segStart !== startTime || segEnd !== endTime) {
                    block.isSegment = true;
                    block.originalStartTime = startTime;
                    block.originalEndTime = endTime;
                }
                block.windowStart = win.start;
                block.windowEnd = win.end;
                // Compute stable base id (original full note span) – segment-specific id already set in ctor
                block.baseNoteId = NoteBlock.fastHashToHex(
                    note.note,
                    note.channel || 0,
                    startTime,
                    endTime,
                    note.velocity
                );
                segments.push(block);
            }
        };

        for (const n of candidateNotes) {
            addClipped(n, prev);
            addClipped(n, current);
            addClipped(n, next);
        }

        return segments;
    }
}
