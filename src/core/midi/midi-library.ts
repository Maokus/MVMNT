import type { MIDIData } from '@core/types';

/**
 * Lightweight MIDI parsing helpers used by timeline ingestion.
 * Uses dynamic import to avoid pulling parser into the main bundle upfront.
 */
export async function parseMIDIFileToData(file: File): Promise<MIDIData> {
    const { MIDIParser } = await import('./midi-parser');
    const parser = new MIDIParser();
    return parser.parseMIDIFile(file);
}

export async function parseMIDIToData(input: ArrayBuffer | File): Promise<MIDIData> {
    const { parseMIDI } = await import('./midi-parser');
    return parseMIDI(input);
}

/**
 * Parse a binary MIDI file directly from an ArrayBuffer, bypassing the File wrapper.
 * Use this in environments where File.prototype.arrayBuffer() may not be available.
 */
export async function parseMIDIArrayBuffer(buffer: ArrayBuffer): Promise<MIDIData> {
    const { MIDIParser } = await import('./midi-parser');
    const parser = new MIDIParser();
    const dataView = new DataView(buffer);
    // Replicate the same init sequence as parseMIDIFile
    const headerChunk = (parser as any).parseHeader(dataView, 0);
    (parser as any).headerInfo = headerChunk;
    let offset = 14;
    (parser as any).tracks = [];
    (parser as any).setTempo(500000);
    (parser as any).setTimeSignature({ numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 });
    (parser as any).tempoEvents = [{ tick: 0, tempo: (parser as any).tempo }];
    for (let i = 0; i < headerChunk.numTracks; i++) {
        const track = (parser as any).parseTrack(dataView, offset, i);
        (parser as any).tracks.push(track);
        offset += track.length + 8;
    }
    (parser as any).checkForTempoInMetadata();
    return (parser as any).convertToPlayableEvents();
}
