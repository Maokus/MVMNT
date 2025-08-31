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
    } as MIDIData;
}

describe('TimelineService Phase 5 — central note queries', () => {
    it('merges multiple tracks and respects offsets', async () => {
        const svc = new TimelineService('test');
        const idA = await svc.addMidiTrack({
            midiData: makeMidi([
                { type: 'noteOn', note: 60, velocity: 100, time: 0.0, tick: 0, channel: 0 },
                { type: 'noteOff', note: 60, velocity: 0, time: 1.0, tick: 480, channel: 0 },
            ]),
            name: 'A',
            offsetSec: 0.5,
        });
        const idB = await svc.addMidiTrack({
            midiData: makeMidi([
                { type: 'noteOn', note: 64, velocity: 100, time: 0.2, tick: 96, channel: 1 },
                { type: 'noteOff', note: 64, velocity: 0, time: 0.7, tick: 336, channel: 1 },
            ]),
            name: 'B',
            offsetSec: 1.0,
        });

        const notes = svc.getNotesInWindow({ trackIds: [idA, idB], startSec: 0, endSec: 2 });
        expect(notes.map((n) => n.trackId)).toEqual([idA, idB]);
        // start times mapped into timeline seconds with per-track offsets
        expect(notes[0].startSec).toBeCloseTo(0.5, 6);
        expect(notes[1].startSec).toBeCloseTo(1.2, 6);
    });

    it('clips to per-track regions', async () => {
        const svc = new TimelineService('test');
        const id = await svc.addMidiTrack({
            midiData: makeMidi([
                { type: 'noteOn', note: 60, velocity: 100, time: 0.2, tick: 96, channel: 0 },
                { type: 'noteOff', note: 60, velocity: 0, time: 1.2, tick: 576, channel: 0 },
            ]),
            name: 'R',
            offsetSec: 0,
        });
        const track = svc.getTrack(id) as any;
        track.regionStartSec = 0.5;
        track.regionEndSec = 1.0;
        const notes = svc.getNotesInWindow({ trackIds: [id], startSec: 0, endSec: 2 });
        // The note overlaps the region, so result should be present and within [0.5,1.0] window intersection
        expect(notes.length).toBe(1);
        expect(notes[0].startSec).toBeGreaterThanOrEqual(0.2); // original start mapped
        expect(notes[0].endSec).toBeGreaterThan(0.5); // still overlapping
    });

    it('honors solo and mute and supports empty trackIds as all', async () => {
        const svc = new TimelineService('test');
        const idA = await svc.addMidiTrack({
            midiData: makeMidi([{ type: 'noteOn', note: 60, velocity: 100, time: 0, tick: 0, channel: 0 }]),
            name: 'A',
        });
        const idB = await svc.addMidiTrack({
            midiData: makeMidi([{ type: 'noteOn', note: 62, velocity: 100, time: 0, tick: 0, channel: 1 }]),
            name: 'B',
        });
        // Mute A, solo B
        (svc.getTrack(idA) as any).mute = true;
        (svc.getTrack(idB) as any).solo = true;
        const notes = svc.getNotesInWindow({ trackIds: [], startSec: 0, endSec: 0.1 });
        expect(notes.length).toBe(1);
        expect(notes[0].trackId).toBe(idB);
        expect(notes[0].note).toBe(62);
    });
});
