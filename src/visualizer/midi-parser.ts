// MIDI Parser Module - TypeScript migration
import { TimingManager } from './timing-manager';
import { MIDIEvent, MIDIData, MIDITimeSignature } from './types';

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
  private timingManager: TimingManager;

  // Legacy properties for backward compatibility (deprecated)
  public ticksPerQuarter: number;
  public tempo: number;
  public timeSignature: MIDITimeSignature;

  constructor() {
    this.tracks = [];
    this.timingManager = new TimingManager();

    // Legacy properties for backward compatibility (deprecated)
    this.ticksPerQuarter = this.timingManager.ticksPerQuarter;
    this.tempo = this.timingManager.tempo;
    this.timeSignature = this.timingManager.timeSignature;
  }

  async parseMIDIFile(file: File): Promise<MIDIData> {
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // Parse MIDI header
    const headerChunk = this.parseHeader(dataView, 0);
    let offset = 14; // Header is always 14 bytes

    this.tracks = [];

    // Reset tempo and time signature to defaults in both local properties and TimingManager
    this.timingManager.setTempo(500000); // Default 120 BPM
    this.tempo = this.timingManager.tempo;

    this.timingManager.setTimeSignature({
      numerator: 4,
      denominator: 4,
      clocksPerClick: 24,
      thirtysecondNotesPerBeat: 8
    });
    this.timeSignature = this.timingManager.timeSignature;

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
      this.timingManager.setTicksPerQuarter(24); // Simplified
    } else {
      this.timingManager.setTicksPerQuarter(division);
    }

    // Update legacy properties for backward compatibility
    this.ticksPerQuarter = this.timingManager.ticksPerQuarter;

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

    const eventType = status & 0xF0;
    const channel = status & 0x0F;

    switch (eventType) {
      case 0x80: // Note Off
        if (offset + 1 >= dataView.byteLength) return null;
        return {
          type: 'noteOff',
          channel,
          note: dataView.getUint8(offset),
          velocity: dataView.getUint8(offset + 1),
          time: absoluteTime,
          nextOffset: offset + 2
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
          nextOffset: offset + 2
        };

      case 0xB0: // Control Change
        if (offset + 1 >= dataView.byteLength) return null;
        return {
          type: 'controlChange',
          channel,
          note: dataView.getUint8(offset), // Controller number
          velocity: dataView.getUint8(offset + 1), // Value
          time: absoluteTime,
          nextOffset: offset + 2
        };

      case 0xC0: // Program Change
        return {
          type: 'programChange',
          channel,
          note: dataView.getUint8(offset), // Program number
          time: absoluteTime,
          nextOffset: offset + 1
        };

      case 0xFF: // Meta Event
        return this.parseMetaEvent(dataView, offset, absoluteTime);

      default:
        // Skip unknown events
        return {
          type: 'meta',
          time: absoluteTime,
          nextOffset: offset + 1
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
        nextOffset: Math.min(dataOffset + length, dataView.byteLength)
      };
    }

    switch (metaType) {
      case 0x51: // Set Tempo
        if (length === 3) {
          const tempo = (dataView.getUint8(dataOffset) << 16) |
            (dataView.getUint8(dataOffset + 1) << 8) |
            dataView.getUint8(dataOffset + 2);
          this.timingManager.setTempo(tempo);
          this.tempo = tempo; // Update legacy property
          console.log(`Found tempo meta event: ${tempo} (${Math.round(60000000 / tempo)} BPM)`);
        }
        break;

      case 0x58: // Time Signature
        if (length === 4) {
          // Time signature: numerator, denominator, clocks per metronome click, 32nd notes per quarter note
          const timeSignature: MIDITimeSignature = {
            numerator: dataView.getUint8(dataOffset),
            denominator: Math.pow(2, dataView.getUint8(dataOffset + 1)), // 2^value
            clocksPerClick: dataView.getUint8(dataOffset + 2),
            thirtysecondNotesPerBeat: dataView.getUint8(dataOffset + 3)
          };
          this.timingManager.setTimeSignature(timeSignature);
          this.timeSignature = timeSignature; // Update legacy property
          console.log(`Found time signature meta event: ${timeSignature.numerator}/${timeSignature.denominator}`);
        }
        break;

      case 0x01: // Text Event
      case 0x02: // Copyright Notice
      case 0x03: // Track Name
      case 0x04: // Instrument Name
      case 0x05: // Lyric
      case 0x06: // Marker
      case 0x07: // Cue Point
        {
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
            nextOffset: dataOffset + length
          };
        }

      case 0x2F: // End of Track
        return {
          type: 'meta',
          metaType,
          time: absoluteTime,
          nextOffset: dataOffset + length
        };
    }

    return {
      type: 'meta',
      metaType,
      time: absoluteTime,
      nextOffset: dataOffset + length
    };
  }

  private readVariableLength(dataView: DataView, offset: number): VariableLengthResult {
    let value = 0;
    let currentOffset = offset;

    while (currentOffset < dataView.byteLength) {
      const byte = dataView.getUint8(currentOffset++);
      value = (value << 7) | (byte & 0x7F);

      if ((byte & 0x80) === 0) {
        break;
      }
    }

    return { value, offset: currentOffset };
  }

  private readString(dataView: DataView, offset: number, length: number): string {
    let result = '';
    for (let i = 0; i < length && (offset + i) < dataView.byteLength; i++) {
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
    console.log(`- Event Types: ${Array.from(new Set(allEvents.map(e => e.type))).join(', ')}`);

    // Sort by time
    allEvents.sort((a, b) => a.time - b.time);

    // Filter for playable events (note on/off)
    const noteEvents = allEvents.filter(event => event.type === 'noteOn' || event.type === 'noteOff');

    // Find the earliest note event to trim empty space at the beginning
    let earliestNoteTime = 0;
    if (noteEvents.length > 0) {
      earliestNoteTime = Math.min(...noteEvents.map(e => e.time));
    }

    // Convert MIDI ticks to seconds using TimingManager
    const secondsPerTick = this.timingManager.getSecondsPerTick();

    // Adjust all events by subtracting the earliest note time (trim empty space)
    const playableEvents: MIDIEvent[] = noteEvents.map(event => ({
      ...event,
      time: (event.time - earliestNoteTime) * secondsPerTick
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

    // Make sure our TimingManager has the latest values
    this.timingManager.setTempo(this.tempo);
    if (this.timeSignature) {
      this.timingManager.setTimeSignature(this.timeSignature);
    }
    this.timingManager.setTicksPerQuarter(this.ticksPerQuarter);

    // Create a clone of the timing manager for the return object
    const timingManagerClone = this.timingManager.clone();

    console.log('MIDIParser returning with timingManager:', {
      bpm: timingManagerClone.bpm,
      tempo: timingManagerClone.tempo,
      timeSignature: timingManagerClone.timeSignature,
      beatsPerBar: timingManagerClone.beatsPerBar,
      ticksPerQuarter: timingManagerClone.ticksPerQuarter
    });

    return {
      events: playableEvents,
      duration,
      tempo: this.tempo,
      ticksPerQuarter: this.ticksPerQuarter,
      timeSignature: this.timeSignature,
      timingManager: timingManagerClone as any,
      trimmedTicks: earliestNoteTime // Include info about how much was trimmed for debugging
    };
  }

  private checkForTempoInMetadata(): void {
    // Look through all tracks for metadata events that might contain tempo information
    for (const track of this.tracks) {
      for (const event of track.events) {
        // Look for track name or text events that might contain BPM information
        if (event.type === 'meta' &&
          event.metaType !== undefined &&
          (event.metaType === 0x03 || event.metaType === 0x01 || event.metaType === 0x06)) {

          // If we have text data, check it for BPM information
          if (event.text) {
            const bpmMatch = event.text.match(/(\d+)\s*(?:bpm|BPM)/);
            if (bpmMatch && bpmMatch[1]) {
              const bpm = parseInt(bpmMatch[1]);
              if (!isNaN(bpm) && bpm > 0) {
                console.log(`Found BPM in metadata: ${bpm}`);
                const tempo = 60000000 / bpm; // Convert to microseconds per quarter note
                this.timingManager.setTempo(tempo);
                this.tempo = tempo; // Update legacy property
              }
            }
          }
        }

        // Look for Ableton-specific markers or chunks
        if (event.type === 'meta' && event.metaType === 0x7F) {
          // Manufacturer specific meta events might contain tempo data
          console.log('Found manufacturer-specific meta event that might contain tempo data');
        }
      }
    }
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
