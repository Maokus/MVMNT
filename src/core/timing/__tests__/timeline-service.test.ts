import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { noteQueryApi } from '@core/timing/note-query';
import { useTimelineStore } from '@state/timelineStore';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import type { MIDIData, MIDIEvent } from '@core/types';

function makeMidi(events: MIDIEvent[], opts?: Partial<MIDIData>): MIDIData {
    return {
        events,
        duration: events.length ? Math.max(...events.map((e) => e.time)) : 0,
        tempo: 500000,
        ticksPerQuarter: CANONICAL_PPQ,
        timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
        trimmedTicks: 0,
        ...opts,
    };
}

describe('Note query basics (store version)', () => {
    it('addMidiTrack with midiData and query notes in window (offsetTicks equivalent)', async () => {
        const evs: MIDIEvent[] = [
            { type: 'noteOn', note: 60, velocity: 100, time: 1, tick: 1 * CANONICAL_PPQ, channel: 0 },
            { type: 'noteOff', note: 60, velocity: 0, time: 2, tick: 2 * CANONICAL_PPQ, channel: 0 },
            { type: 'noteOn', note: 64, velocity: 100, time: 3, tick: 3 * CANONICAL_PPQ, channel: 0 },
            { type: 'noteOff', note: 64, velocity: 0, time: 4, tick: 4 * CANONICAL_PPQ, channel: 0 },
        ];
        const midi = makeMidi(evs);
        const ingested = buildNotesFromMIDI(midi);
        const store = useTimelineStore.getState();
        const id = await useTimelineStore.getState().addMidiTrack({ name: 'Piano', offsetTicks: 0 });
        // Simulate second-based offsetSec=0.5 by converting to beats then ticks.
        // At 120 bpm -> 0.5s == 1 beat (since 60/120). So offsetTicks = CANONICAL_PPQ.
        useTimelineStore.getState().setTrackOffsetTicks(id, 1 * CANONICAL_PPQ); // 1 beat
        useTimelineStore.getState().ingestMidiToCache(id, ingested);
        const notes = noteQueryApi.getNotesInWindow(useTimelineStore.getState(), [id], 0, 10);
        expect(notes.length).toBe(2);
        expect(notes[0].note).toBe(60);
        // Our ingestion derives seconds from beats (ticks/PPQ) using global BPM 120.
        // start tick 1*PPQ => 1 beat => 0.5s plus offset 1 beat (0.5s) => total ~1.0s
        expect(notes[0].startSec).toBeGreaterThan(0.95);
        expect(notes[0].startSec).toBeLessThan(1.05);
        expect(notes[1].note).toBe(64);
        // tick 3*PPQ => 3 beats => 1.5s + 0.5s offset => 2.0s
        expect(notes[1].startSec).toBeGreaterThan(1.95);
        expect(notes[1].startSec).toBeLessThan(2.05);
    });
});
