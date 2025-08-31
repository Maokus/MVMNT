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
