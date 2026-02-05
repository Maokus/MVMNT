import { describe, expect, it } from 'vitest';
import { MIDIParser } from '@core/midi/midi-parser';

function buildMidi(trackData: number[]): ArrayBuffer {
    const trackLength = trackData.length;
    const header = [
        0x4d, 0x54, 0x68, 0x64, // 'MThd'
        0x00, 0x00, 0x00, 0x06, // header length
        0x00, 0x00, // format 0
        0x00, 0x01, // one track
        0x00, 0x60, // division (96 PPQ)
        0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
        (trackLength >> 24) & 0xff,
        (trackLength >> 16) & 0xff,
        (trackLength >> 8) & 0xff,
        trackLength & 0xff,
    ];

    const bytes = new Uint8Array([...header, ...trackData]);
    return bytes.buffer.slice(0);
}

describe('MIDIParser running status handling', () => {
    it('keeps channel events aligned around meta/system messages', async () => {
        const arrayBuffer = buildMidi([
            0x00,
            0x90,
            0x3c,
            0x40,
            0x00,
            0xff,
            0x03,
            0x04,
            0x54,
            0x65,
            0x73,
            0x74,
            0x20,
            0x80,
            0x3c,
            0x00,
            0x00,
            0xe0,
            0x00,
            0x40,
            0x00,
            0xff,
            0x2f,
            0x00,
        ]);
        const fakeFile = {
            arrayBuffer: async () => arrayBuffer.slice(0),
            name: 'test.mid',
        } as unknown as File;
        const parser = new MIDIParser();
        const midi = await parser.parseMIDIFile(fakeFile);

        expect(midi.ticksPerQuarter).toBe(0x60);
        const noteEvents = midi.events.filter((event) => event.type === 'noteOn' || event.type === 'noteOff');
        expect(noteEvents).toHaveLength(2);
        const [noteOn, noteOff] = noteEvents;
        expect(noteOn.type).toBe('noteOn');
        expect(noteOn.tick).toBe(0);
        expect(noteOff.type).toBe('noteOff');
        expect(noteOff.tick).toBe(0x20);
    });

    it('parses running status note off events without explicit status bytes', async () => {
        const arrayBuffer = buildMidi([
            0x00,
            0x90,
            0x3c,
            0x40,
            0x20,
            0x3c,
            0x00,
            0x00,
            0xff,
            0x2f,
            0x00,
        ]);
        const fakeFile = {
            arrayBuffer: async () => arrayBuffer.slice(0),
            name: 'running-status.mid',
        } as unknown as File;
        const parser = new MIDIParser();
        const midi = await parser.parseMIDIFile(fakeFile);

        const noteEvents = midi.events.filter((event) => event.type === 'noteOn' || event.type === 'noteOff');
        expect(noteEvents).toHaveLength(2);
        const [noteOn, noteOff] = noteEvents;
        expect(noteOn.tick).toBe(0);
        expect(noteOff.tick).toBe(0x20);
    });
});

