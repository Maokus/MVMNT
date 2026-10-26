import { describe, expect, it, vi } from 'vitest';
import { MIDIParser } from '@core/midi/midi-parser';

function midiWithTrack(events: number[]): File {
    const length = events.length;
    const bytes = new Uint8Array([
        0x4d,
        0x54,
        0x68,
        0x64,
        0,
        0,
        0,
        6,
        0,
        0,
        0,
        1,
        0,
        96,
        0x4d,
        0x54,
        0x72,
        0x6b,
        (length >>> 24) & 0xff,
        (length >>> 16) & 0xff,
        (length >>> 8) & 0xff,
        length & 0xff,
        ...events,
    ]);
    return {
        name: 'extreme-tempo.mid',
        arrayBuffer: async () => bytes.buffer.slice(0),
    } as File;
}

describe('MIDIParser tempo import range', () => {
    it('ignores a 155 µs tempo event and keeps notes at the default 120 BPM', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const midi = await new MIDIParser().parseMIDIFile(
                midiWithTrack([0, 0xff, 0x51, 3, 0, 0, 0x9b, 0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0xff, 0x2f, 0])
            );

            expect(midi.tempo).toBe(500_000);
            expect((midi as typeof midi & { tempoMap: { time: number; tempo: number }[] }).tempoMap).toEqual([
                { time: 0, tempo: 500_000 },
            ]);
            expect(midi.duration).toBeCloseTo(0.5);
            expect(warn).toHaveBeenCalledOnce();
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps the last supported tempo when a later tempo event is out of range', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const midi = await new MIDIParser().parseMIDIFile(
                midiWithTrack([
                    0,
                    0xff,
                    0x51,
                    3,
                    0x0a,
                    0x2c,
                    0x2a, // 666,666 µs, about 90 BPM
                    0,
                    0x90,
                    60,
                    100,
                    96,
                    0xff,
                    0x51,
                    3,
                    0,
                    0,
                    0x9b,
                    96,
                    0x80,
                    60,
                    0,
                    0,
                    0xff,
                    0x2f,
                    0,
                ])
            );

            expect(midi.tempo).toBe(666_666);
            expect(midi.duration).toBeCloseTo((2 * 666_666) / 1_000_000);
            expect(warn).toHaveBeenCalledOnce();
        } finally {
            warn.mockRestore();
        }
    });
});
