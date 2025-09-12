import { describe, it, expect } from 'vitest';
import { TimelineService } from '@core/timing';
import type { MIDIData, MIDIEvent } from '@core/types';

function makeMidi(events: MIDIEvent[], opts?: Partial<MIDIData>): MIDIData {
    return {
        events,
        duration: events.length ? Math.max(...events.map((e) => e.time)) : 0,
        tempo: 500000,
        ticksPerQuarter: 480,
        timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
        trimmedTicks: 0,
        ...opts,
    };
}

describe('TimelineService Phase 3 basics', () => {
    it('addMidiTrack with midiData and query notes in window', async () => {
        const svc = new TimelineService('test');
        const evs: MIDIEvent[] = [
            { type: 'noteOn', note: 60, velocity: 100, time: 1, tick: 480, channel: 0 },
            { type: 'noteOff', note: 60, velocity: 0, time: 2, tick: 960, channel: 0 },
            { type: 'noteOn', note: 64, velocity: 100, time: 3, tick: 1440, channel: 0 },
            { type: 'noteOff', note: 64, velocity: 0, time: 4, tick: 1920, channel: 0 },
        ];
        const id = await svc.addMidiTrack({ midiData: makeMidi(evs), name: 'Piano', offsetSec: 0.5 });
        const notes = svc.getNotesInWindow({ trackIds: [id], startSec: 0, endSec: 10 });
        expect(notes.length).toBe(2);
        expect(notes[0].note).toBe(60);
        expect(notes[0].startSec).toBeCloseTo(1 + 0.5, 6);
        expect(notes[1].note).toBe(64);
        expect(notes[1].startSec).toBeCloseTo(3 + 0.5, 6);
    });
});
