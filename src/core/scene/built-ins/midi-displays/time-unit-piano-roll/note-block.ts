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
import { clipTemporalIntervalAcrossWindows, type SteppedTemporalWindowFrame } from '@core/timing/temporal-window';

// Scene elements accept tick-domain note data.
// NoteBlock now optionally carries canonical tick timing alongside its seconds timing.
// Seconds remain for rendering until full scene migration completes; ticks allow robust
// reconstruction of real time when tempo or tempo map changes.

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

    // Canonical tick timing (optional during migration)
    public startTick?: number;
    public endTick?: number;
    public durationTicks?: number;

    constructor(
        note: number,
        channel: number,
        startTime: number,
        endTime: number,
        velocity: number,
        opts?: {
            startTick?: number;
            endTick?: number;
            durationTicks?: number;
        }
    ) {
        super(note, channel, startTime, endTime, velocity);
        if (opts) {
            this.startTick = opts.startTick;
            this.endTick = opts.endTick;
            this.durationTicks =
                opts.durationTicks ??
                (opts.endTick != null && opts.startTick != null
                    ? Math.max(0, opts.endTick - opts.startTick)
                    : undefined);
        }
        // Segment-specific id initially identical to base id; downstream normalization may reassign the base id
        this.noteId = NoteBlock.fastHashToHex(
            note,
            channel,
            this.startTick ?? startTime,
            this.endTick ?? endTime,
            velocity
        );
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

    // Build clamped segments for previous, current, and next time-unit windows.
    static buildWindowedSegments(
        notes: Array<{
            note: number;
            channel?: number;
            velocity: number;
            // At least one of (startTime/endTime) in seconds OR (startTick/endTick) in ticks must be provided
            startTime?: number;
            endTime?: number;
            startTick?: number;
            endTick?: number;
            durationTicks?: number;
            startBeat?: number; // optional beat-domain (for mixed inputs)
            endBeat?: number;
        }>,
        timingManager: any,
        temporalFrame: SteppedTemporalWindowFrame
    ): NoteBlock[] {
        const { previous, current, next } = temporalFrame.windows;

        const minTime = previous.start;
        const maxTime = next.end;

        const candidateNotes = notes.filter((n) => {
            // Derive seconds from beats or ticks if explicit seconds not given
            let s: number;
            let e: number;
            if (n.startTime != null && n.endTime != null) {
                s = n.startTime;
                e = n.endTime;
            } else if (n.startBeat !== undefined && n.endBeat !== undefined) {
                s = timingManager.beatsToSeconds(n.startBeat);
                e = timingManager.beatsToSeconds(n.endBeat);
            } else if (n.startTick != null && n.endTick != null) {
                const beatsStart = n.startTick / timingManager.ticksPerQuarter;
                const beatsEnd = n.endTick / timingManager.ticksPerQuarter;
                s = timingManager.beatsToSeconds(beatsStart);
                e = timingManager.beatsToSeconds(beatsEnd);
            } else {
                return false; // insufficient timing info
            }
            return s < maxTime && e > minTime;
        });

        const segments: NoteBlock[] = [];

        const resolveTimes = (note: any) => {
            // Resolve canonical seconds timing first
            let startTime: number;
            let endTime: number;
            if (note.startBeat !== undefined && note.endBeat !== undefined) {
                startTime = timingManager.beatsToSeconds(note.startBeat);
                endTime = timingManager.beatsToSeconds(note.endBeat);
            } else if (note.startTick != null && note.endTick != null) {
                const beatsStart = note.startTick / timingManager.ticksPerQuarter;
                const beatsEnd = note.endTick / timingManager.ticksPerQuarter;
                startTime = timingManager.beatsToSeconds(beatsStart);
                endTime = timingManager.beatsToSeconds(beatsEnd);
            } else {
                startTime = note.startTime;
                endTime = note.endTime;
            }
            return { startTime, endTime };
        };

        for (const note of candidateNotes) {
            const { startTime, endTime } = resolveTimes(note);
            const clippedSegments = clipTemporalIntervalAcrossWindows({ start: startTime, end: endTime }, [
                previous,
                current,
                next,
            ]);
            for (const { interval, window } of clippedSegments) {
                const segStart = interval.start;
                const segEnd = interval.end;
                const block = new NoteBlock(note.note, note.channel || 0, segStart, segEnd, note.velocity, {
                    startTick: note.startTick,
                    endTick: note.endTick,
                    durationTicks: note.durationTicks,
                });
                if (segStart !== startTime || segEnd !== endTime) {
                    block.isSegment = true;
                    block.originalStartTime = startTime;
                    block.originalEndTime = endTime;
                }
                block.windowStart = window.start;
                block.windowEnd = window.end;
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
        }

        return segments;
    }
}
