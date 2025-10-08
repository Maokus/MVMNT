import { describe, expect, it } from 'vitest';
import { MIDIParser } from '@core/midi/midi-parser';
import { splitMidiDataByTracks } from '@core/midi/midi-ingest';

function buildMultiTrackMidi(): ArrayBuffer {
    const header = [
        0x4d, 0x54, 0x68, 0x64, // 'MThd'
        0x00, 0x00, 0x00, 0x06, // header length
        0x00, 0x01, // format 1 (multiple tracks)
        0x00, 0x02, // two tracks
        0x00, 0x60, // division (96 PPQ)
    ];

    const track1Data = [
        0x00, 0xff, 0x03, 0x05, 0x50, 0x69, 0x61, 0x6e, 0x6f, // Track name "Piano"
        0x00, 0x90, 0x3c, 0x40, // Note on C4
        0x20, 0x80, 0x3c, 0x00, // Note off after 0x20 ticks
        0x00, 0xff, 0x2f, 0x00, // End of track
    ];
    const track2Data = [
        0x00, 0xff, 0x03, 0x07, 0x53, 0x74, 0x72, 0x69, 0x6e, 0x67, 0x73, // "Strings"
        0x00, 0x90, 0x3e, 0x45, // Note on D4
        0x18, 0x80, 0x3e, 0x00, // Note off after 0x18 ticks
        0x00, 0xff, 0x2f, 0x00, // End of track
    ];

    const encodeTrack = (track: number[]) => {
        const length = track.length;
        return [
            0x4d,
            0x54,
            0x72,
            0x6b,
            (length >> 24) & 0xff,
            (length >> 16) & 0xff,
            (length >> 8) & 0xff,
            length & 0xff,
            ...track,
        ];
    };

    const bytes = new Uint8Array([...header, ...encodeTrack(track1Data), ...encodeTrack(track2Data)]);
    return bytes.buffer.slice(0);
}

describe('MIDIParser multi-track metadata', () => {
    it('collects per-track details and supports splitting', async () => {
        const arrayBuffer = buildMultiTrackMidi();
        const fakeFile = {
            arrayBuffer: async () => arrayBuffer.slice(0),
            name: 'multitrack.mid',
        } as unknown as File;

        const parser = new MIDIParser();
        const midi = await parser.parseMIDIFile(fakeFile);

        expect(midi.trackSummaries).toBeTruthy();
        expect(midi.trackSummaries?.map((summary) => summary.name)).toEqual(['Piano', 'Strings']);
        expect(midi.trackDetails?.length).toBe(2);
        expect(midi.trackDetails?.[0].noteCount).toBe(1);
        expect(midi.trackDetails?.[1].noteCount).toBe(1);

        const splits = splitMidiDataByTracks(midi);
        expect(splits).toHaveLength(2);
        expect(splits[0].track.events).toHaveLength(2);
        expect(splits[1].track.events[0].trackIndex).toBe(1);
        expect(splits[1].data.events).toHaveLength(2);
    });
});
