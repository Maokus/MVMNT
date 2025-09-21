// MIDI Parser Module - TypeScript migration (Timing logic inlined; TimingManager removed)
import { MIDIEvent, MIDIData, MIDITimeSignature } from '@core/types';
import { CANONICAL_PPQ } from '@core/timing/ppq';

interface MIDIHeader {
    format: number;
    numTracks: number;
    division: number;
}

interface MIDITrack {
    events: MIDIEvent[];
    length: number;
}

interface VariableLengthResult {
    value: number;
    offset: number;
}

interface ParsedEvent extends MIDIEvent {
    nextOffset: number;
}

export class MIDIParser {
    private tracks: MIDITrack[] = [];
    // Timing state (formerly handled by TimingManager)
    public ticksPerQuarter: number; // MIDI PPQ
    public tempo: number; // microseconds per quarter note
    public timeSignature: MIDITimeSignature;
    public beatsPerBar: number;
    public bpm: number;
    // Tempo map as collected during parse (absolute time in ticks until conversion stage)
    private tempoEvents: Array<{ tick: number; tempo: number }>; // microseconds per quarter at given tick

    // Cached values to avoid recomputation
    private _secondsPerBeat?: number;
    private _secondsPerBar?: number;
    private _secondsPerTick?: number;

    constructor() {
        this.tracks = [];
        // Defaults (use canonical PPQ so downstream normalization is consistent)
        this.ticksPerQuarter = CANONICAL_PPQ;
        this.tempo = 500000; // 120 BPM
        this.bpm = 60000000 / this.tempo;
        this.timeSignature = {
            numerator: 4,
            denominator: 4,
            clocksPerClick: 24,
            thirtysecondNotesPerBeat: 8,
        };
        this.beatsPerBar = this.timeSignature.numerator || 4;
        this._invalidateCache();
        this.tempoEvents = [];
    }

    async parseMIDIFile(file: File): Promise<MIDIData> {
        const arrayBuffer = await file.arrayBuffer();
        const dataView = new DataView(arrayBuffer);

        // Parse MIDI header
        const headerChunk = this.parseHeader(dataView, 0);
        let offset = 14; // Header is always 14 bytes

        this.tracks = [];

        // Reset tempo and time signature to defaults
        this.setTempo(500000); // Default 120 BPM
        this.setTimeSignature({
            numerator: 4,
            denominator: 4,
            clocksPerClick: 24,
            thirtysecondNotesPerBeat: 8,
        });
        // Reset tempo events and seed with starting tempo at tick 0
        this.tempoEvents = [{ tick: 0, tempo: this.tempo }];

        // Parse all tracks
        for (let i = 0; i < headerChunk.numTracks; i++) {
            const track = this.parseTrack(dataView, offset);
            this.tracks.push(track);
            offset += track.length + 8; // 8 bytes for track header
        }

        // Debugging: Log file information to help troubleshoot
        console.log(`MIDI File Parsed: ${file.name}`);
        console.log(`- Format: ${headerChunk.format}`);
        console.log(`- Tracks: ${headerChunk.numTracks}`);
        console.log(`- Division: ${headerChunk.division}`);
        console.log(`- Detected Tempo: ${this.tempo} (${Math.round(60000000 / this.tempo)} BPM)`);
        console.log(`- Time Signature: ${this.timeSignature.numerator}/${this.timeSignature.denominator}`);

        // Check for tempo in track names or metadata (some DAWs like Ableton include it there)
        this.checkForTempoInMetadata();

        return this.convertToPlayableEvents();
    }

    private parseHeader(dataView: DataView, offset: number): MIDIHeader {
        // Check if we have enough bytes for header
        if (dataView.byteLength < 14) {
            throw new Error('Invalid MIDI file: File too small');
        }

        // Verify MThd header
        const header = this.readString(dataView, offset, 4);
        if (header !== 'MThd') {
            throw new Error('Invalid MIDI file: Missing MThd header');
        }

        // Read header length (not used but part of MIDI spec)
        // const headerLength = dataView.getUint32(offset + 4);
        const format = dataView.getUint16(offset + 8);
        const numTracks = dataView.getUint16(offset + 10);
        const division = dataView.getUint16(offset + 12);

        if (division & 0x8000) {
            // SMPTE time division
            this.setTicksPerQuarter(24); // Simplified
        } else {
            this.setTicksPerQuarter(division);
        }

        return { format, numTracks, division };
    }

    private parseTrack(dataView: DataView, offset: number): MIDITrack {
        // Check if we have enough bytes for track header
        if (offset + 8 > dataView.byteLength) {
            throw new Error('Invalid MIDI track: Insufficient data for track header');
        }

        // Verify MTrk header
        const header = this.readString(dataView, offset, 4);
        if (header !== 'MTrk') {
            throw new Error('Invalid MIDI track: Missing MTrk header');
        }

        const length = dataView.getUint32(offset + 4);
        const events: MIDIEvent[] = [];
        let currentOffset = offset + 8;
        const endOffset = currentOffset + length;
        let runningStatus = 0;
        let absoluteTime = 0;

        // Check if track length is valid
        if (endOffset > dataView.byteLength) {
            throw new Error('Invalid MIDI track: Track length exceeds file size');
        }

        while (currentOffset < endOffset) {
            // Check bounds before reading
            if (currentOffset >= dataView.byteLength) {
                break;
            }

            // Read variable length quantity (delta time)
            const deltaTimeResult = this.readVariableLength(dataView, currentOffset);
            const deltaTime = deltaTimeResult.value;
            absoluteTime += deltaTime;
            currentOffset = deltaTimeResult.offset;

            // Check bounds before reading status
            if (currentOffset >= dataView.byteLength) {
                break;
            }

            // Read event
            let status = dataView.getUint8(currentOffset);

            // Handle running status
            if (status < 0x80) {
                status = runningStatus;
                currentOffset--; // Back up one byte
            } else {
                runningStatus = status;
            }

            currentOffset++;

            const event = this.parseEvent(dataView, currentOffset, status, absoluteTime);
            if (event) {
                events.push(event);
                currentOffset = event.nextOffset;
            } else {
                currentOffset++;
            }
        }

        return { events, length };
    }

    private parseEvent(dataView: DataView, offset: number, status: number, absoluteTime: number): ParsedEvent | null {
        // Check bounds before accessing data
        if (offset >= dataView.byteLength) {
            return null;
        }

        const eventType = status & 0xf0;
        const channel = status & 0x0f;

        switch (eventType) {
            case 0x80: // Note Off
                if (offset + 1 >= dataView.byteLength) return null;
                return {
                    type: 'noteOff',
                    channel,
                    note: dataView.getUint8(offset),
                    velocity: dataView.getUint8(offset + 1),
                    time: absoluteTime,
                    nextOffset: offset + 2,
                };

            case 0x90: // Note On
                if (offset + 1 >= dataView.byteLength) return null;
                const velocity = dataView.getUint8(offset + 1);
                return {
                    type: velocity > 0 ? 'noteOn' : 'noteOff',
                    channel,
                    note: dataView.getUint8(offset),
                    velocity,
                    time: absoluteTime,
                    nextOffset: offset + 2,
                };

            case 0xb0: // Control Change
                if (offset + 1 >= dataView.byteLength) return null;
                return {
                    type: 'controlChange',
                    channel,
                    note: dataView.getUint8(offset), // Controller number
                    velocity: dataView.getUint8(offset + 1), // Value
                    time: absoluteTime,
                    nextOffset: offset + 2,
                };

            case 0xc0: // Program Change
                return {
                    type: 'programChange',
                    channel,
                    note: dataView.getUint8(offset), // Program number
                    time: absoluteTime,
                    nextOffset: offset + 1,
                };

            case 0xff: // Meta Event
                return this.parseMetaEvent(dataView, offset, absoluteTime);

            default:
                // Skip unknown events
                return {
                    type: 'meta',
                    time: absoluteTime,
                    nextOffset: offset + 1,
                };
        }
    }

    private parseMetaEvent(dataView: DataView, offset: number, absoluteTime: number): ParsedEvent | null {
        if (offset >= dataView.byteLength) {
            return null;
        }

        const metaType = dataView.getUint8(offset);
        const lengthResult = this.readVariableLength(dataView, offset + 1);
        const length = lengthResult.value;
        const dataOffset = lengthResult.offset;

        // Check bounds for meta event data
        if (dataOffset + length > dataView.byteLength) {
            return {
                type: 'meta',
                metaType,
                time: absoluteTime,
                nextOffset: Math.min(dataOffset + length, dataView.byteLength),
            };
        }

        switch (metaType) {
            case 0x51: // Set Tempo
                if (length === 3) {
                    const tempo =
                        (dataView.getUint8(dataOffset) << 16) |
                        (dataView.getUint8(dataOffset + 1) << 8) |
                        dataView.getUint8(dataOffset + 2);
                    this.setTempo(tempo);
                    console.log(`Found tempo meta event: ${tempo} (${Math.round(60000000 / tempo)} BPM)`);
                    // Record tempo event at current absolute tick
                    this.tempoEvents.push({ tick: absoluteTime, tempo });
                }
                break;

            case 0x58: // Time Signature
                if (length === 4) {
                    // Time signature: numerator, denominator, clocks per metronome click, 32nd notes per quarter note
                    const timeSignature: MIDITimeSignature = {
                        numerator: dataView.getUint8(dataOffset),
                        denominator: Math.pow(2, dataView.getUint8(dataOffset + 1)), // 2^value
                        clocksPerClick: dataView.getUint8(dataOffset + 2),
                        thirtysecondNotesPerBeat: dataView.getUint8(dataOffset + 3),
                    };
                    this.setTimeSignature(timeSignature);
                    console.log(
                        `Found time signature meta event: ${timeSignature.numerator}/${timeSignature.denominator}`
                    );
                }
                break;

            case 0x01: // Text Event
            case 0x02: // Copyright Notice
            case 0x03: // Track Name
            case 0x04: // Instrument Name
            case 0x05: // Lyric
            case 0x06: // Marker
            case 0x07: {
                // Cue Point
                // Extract text from these events
                let text = '';
                for (let i = 0; i < length; i++) {
                    if (dataOffset + i < dataView.byteLength) {
                        text += String.fromCharCode(dataView.getUint8(dataOffset + i));
                    }
                }

                console.log(`Found text meta event (type ${metaType}): "${text}"`);

                return {
                    type: 'meta',
                    metaType,
                    text,
                    time: absoluteTime,
                    nextOffset: dataOffset + length,
                };
            }

            case 0x2f: // End of Track
                return {
                    type: 'meta',
                    metaType,
                    time: absoluteTime,
                    nextOffset: dataOffset + length,
                };
        }

        return {
            type: 'meta',
            metaType,
            time: absoluteTime,
            nextOffset: dataOffset + length,
        };
    }

    private readVariableLength(dataView: DataView, offset: number): VariableLengthResult {
        let value = 0;
        let currentOffset = offset;

        while (currentOffset < dataView.byteLength) {
            const byte = dataView.getUint8(currentOffset++);
            value = (value << 7) | (byte & 0x7f);

            if ((byte & 0x80) === 0) {
                break;
            }
        }

        return { value, offset: currentOffset };
    }

    private readString(dataView: DataView, offset: number, length: number): string {
        let result = '';
        for (let i = 0; i < length && offset + i < dataView.byteLength; i++) {
            result += String.fromCharCode(dataView.getUint8(offset + i));
        }
        return result;
    }

    private convertToPlayableEvents(): MIDIData {
        const allEvents: MIDIEvent[] = [];

        // Combine all track events
        for (const track of this.tracks) {
            allEvents.push(...track.events);
        }

        // Additional debug logging for Ableton files
        console.log(`MIDI Conversion Details:`);
        console.log(`- Final Tempo: ${this.tempo} μs per quarter (${Math.round(60000000 / this.tempo)} BPM)`);
        console.log(`- Time Signature: ${this.timeSignature.numerator}/${this.timeSignature.denominator}`);
        console.log(`- Total Events: ${allEvents.length}`);
        console.log(`- Event Types: ${Array.from(new Set(allEvents.map((e) => e.type))).join(', ')}`);

        // Sort by time
        allEvents.sort((a, b) => a.time - b.time);

        // Filter for playable events (note on/off)
        const noteEvents = allEvents.filter((event) => event.type === 'noteOn' || event.type === 'noteOff');

        // Find the earliest note event to trim empty space at the beginning
        let earliestNoteTime = 0;
        if (noteEvents.length > 0) {
            earliestNoteTime = Math.min(...noteEvents.map((e) => e.time));
        }

        // Build tempo segments based on tempo events for accurate tick->seconds conversion
        const tempoEventsSorted = [...this.tempoEvents].sort((a, b) => a.tick - b.tick);
        // Deduplicate by tick, keeping last occurrence
        const dedup: Array<{ tick: number; tempo: number }> = [];
        for (const ev of tempoEventsSorted) {
            if (dedup.length > 0 && dedup[dedup.length - 1].tick === ev.tick) {
                dedup[dedup.length - 1] = ev;
            } else {
                dedup.push(ev);
            }
        }
        type TempoSeg = { startTick: number; tempo: number; secondsPerTick: number; cumulativeSeconds: number };
        const segments: TempoSeg[] = [];
        let cumulativeSeconds = 0;
        for (let i = 0; i < dedup.length; i++) {
            const tempo = dedup[i].tempo;
            const startTick = dedup[i].tick;
            const secondsPerTick = tempo / 1_000_000 / this.ticksPerQuarter;
            // Set cumulativeSeconds for this segment based on previous segment duration
            if (segments.length > 0) {
                const prev = segments[segments.length - 1];
                const tickDelta = Math.max(0, startTick - prev.startTick);
                cumulativeSeconds = prev.cumulativeSeconds + tickDelta * prev.secondsPerTick;
            } else {
                cumulativeSeconds = 0;
            }
            segments.push({ startTick, tempo, secondsPerTick, cumulativeSeconds });
        }
        // Helper to map ticks to seconds using segments
        const ticksToSeconds = (tick: number): number => {
            if (segments.length === 0) {
                // Fallback to current tempo
                const spt = this.getSecondsPerTick();
                return tick * spt;
            }
            // Binary search for segment with startTick <= tick
            let lo = 0,
                hi = segments.length - 1,
                idx = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (segments[mid].startTick <= tick) {
                    idx = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            const seg = segments[idx];
            const deltaTicks = tick - seg.startTick;
            return seg.cumulativeSeconds + deltaTicks * seg.secondsPerTick;
        };

        // Convert ticks to seconds using tempo map and trim by earliest note time
        const earliestSeconds = ticksToSeconds(earliestNoteTime);
        const playableEvents: MIDIEvent[] = noteEvents.map((event) => ({
            ...event,
            time: Math.max(0, ticksToSeconds(event.time) - earliestSeconds),
            tick: event.time - earliestNoteTime,
        }));

        // Calculate total duration based on the end of the final note
        // Pair noteOn/noteOff to compute note end times precisely; fallback to 1s for unmatched notes
        let duration = 0;
        if (playableEvents.length > 0) {
            const noteOnMap = new Map<string, MIDIEvent>();
            const noteEndTimes: number[] = [];

            for (const ev of playableEvents) {
                if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
                    const key = `${ev.note}_${ev.channel || 0}`;
                    noteOnMap.set(key, ev);
                } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
                    const key = `${ev.note}_${ev.channel || 0}`;
                    const on = noteOnMap.get(key);
                    if (on) {
                        noteEndTimes.push(ev.time);
                        noteOnMap.delete(key);
                    }
                }
            }

            // Any remaining noteOns without an off: assume 1s duration
            noteOnMap.forEach((on) => {
                noteEndTimes.push(on.time + 1.0);
            });

            if (noteEndTimes.length > 0) {
                duration = Math.max(...noteEndTimes);
            }
        }

        // Build tempo map (in seconds) from collected tempoEvents
        let tempoMapSec: Array<{ time: number; tempo: number }> | undefined = undefined;
        if (segments.length > 0) {
            tempoMapSec = segments.map((seg, i) => ({
                time: Math.max(0, seg.cumulativeSeconds - earliestSeconds),
                tempo: seg.tempo,
            }));
            // Ensure the first map entry is at 0
            if (tempoMapSec.length > 0) tempoMapSec[0].time = 0;
        }

        console.log('MIDIParser returning timing configuration:', {
            bpm: this.bpm,
            tempo: this.tempo,
            timeSignature: this.timeSignature,
            beatsPerBar: this.beatsPerBar,
            ticksPerQuarter: this.ticksPerQuarter,
            tempoMapEntries: tempoMapSec?.length || 0,
        });

        return {
            events: playableEvents,
            duration,
            tempo: this.tempo,
            ticksPerQuarter: this.ticksPerQuarter,
            timeSignature: this.timeSignature,
            // include tempo map in seconds for downstream managers
            // Note: types.ts doesn't include tempoMap yet; MidiManager will read it if present
            ...(tempoMapSec ? ({ tempoMap: tempoMapSec } as any) : {}),
            trimmedTicks: earliestNoteTime, // Include info about how much was trimmed for debugging
        };
    }

    private checkForTempoInMetadata(): void {
        // Look through all tracks for metadata events that might contain tempo information
        for (const track of this.tracks) {
            for (const event of track.events) {
                // Look for track name or text events that might contain BPM information
                if (
                    event.type === 'meta' &&
                    event.metaType !== undefined &&
                    (event.metaType === 0x03 || event.metaType === 0x01 || event.metaType === 0x06)
                ) {
                    // If we have text data, check it for BPM information
                    if (event.text) {
                        const bpmMatch = event.text.match(/(\d+)\s*(?:bpm|BPM)/);
                        if (bpmMatch && bpmMatch[1]) {
                            const bpm = parseInt(bpmMatch[1]);
                            if (!isNaN(bpm) && bpm > 0) {
                                console.log(`Found BPM in metadata: ${bpm}`);
                                const tempo = 60000000 / bpm; // Convert to microseconds per quarter note
                                this.setTempo(tempo);
                            }
                        }
                    }
                }

                // Look for Ableton-specific markers or chunks
                if (event.type === 'meta' && event.metaType === 0x7f) {
                    // Manufacturer specific meta events might contain tempo data
                    console.log('Found manufacturer-specific meta event that might contain tempo data');
                }
            }
        }
    }

    // ==========================
    // Timing utilities (inlined)
    // ==========================
    private _invalidateCache(): void {
        this._secondsPerBeat = undefined;
        this._secondsPerBar = undefined;
        this._secondsPerTick = undefined;
    }

    private setTempo(tempo: number): void {
        if (tempo <= 0) throw new Error('Tempo must be positive');
        if (this.tempo !== tempo) {
            this.tempo = tempo;
            this.bpm = 60000000 / tempo;
            this._invalidateCache();
        }
    }

    private setTimeSignature(timeSignature: MIDITimeSignature): void {
        if (!timeSignature) return;
        const changed = !this.timeSignature || JSON.stringify(this.timeSignature) !== JSON.stringify(timeSignature);
        if (changed) {
            this.timeSignature = { ...timeSignature };
            if (timeSignature.numerator) {
                this.beatsPerBar = timeSignature.numerator;
            }
            this._invalidateCache();
        }
    }

    private setTicksPerQuarter(ticksPerQuarter: number): void {
        if (ticksPerQuarter <= 0) throw new Error('Ticks per quarter must be positive');
        if (this.ticksPerQuarter !== ticksPerQuarter) {
            this.ticksPerQuarter = ticksPerQuarter;
            this._invalidateCache();
        }
    }

    private getSecondsPerBeat(): number {
        if (this._secondsPerBeat === undefined) {
            this._secondsPerBeat = 60 / this.bpm;
        }
        return this._secondsPerBeat;
    }

    private getSecondsPerBar(): number {
        if (this._secondsPerBar === undefined) {
            this._secondsPerBar = this.getSecondsPerBeat() * (this.beatsPerBar || 4);
        }
        return this._secondsPerBar;
    }

    private getSecondsPerTick(): number {
        if (this._secondsPerTick === undefined) {
            this._secondsPerTick = this.tempo / 1_000_000 / this.ticksPerQuarter;
        }
        return this._secondsPerTick;
    }
}

// Export a convenience function that matches the demo's expectations
export async function parseMIDI(arrayBufferOrFile: ArrayBuffer | File): Promise<MIDIData> {
    const parser = new MIDIParser();

    // If it's a File object, use parseMIDIFile
    if (arrayBufferOrFile instanceof File) {
        return await parser.parseMIDIFile(arrayBufferOrFile);
    }

    // If it's an ArrayBuffer, create a mock File object for the parser
    const mockFile = new File([arrayBufferOrFile], 'uploaded-file.mid');
    return await parser.parseMIDIFile(mockFile);
}
