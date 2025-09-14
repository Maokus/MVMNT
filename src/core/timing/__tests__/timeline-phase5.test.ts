import { describe, it, expect } from 'vitest';
import { noteQueryApi } from '@core/timing/note-query';
import { CANONICAL_PPQ } from '@core/timing/ppq';
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
    } as MIDIData;
}

describe('Central note queries (store version)', () => {
    it('merges multiple tracks and respects offsets', async () => {
        const store = useTimelineStore.getState();
        const idA = await store.addMidiTrack({ name: 'A', offsetTicks: 0 });
        const idB = await store.addMidiTrack({ name: 'B', offsetTicks: 0 });
        // Offsets: 0.5s and 1.0s -> at 120bpm => beats (0.5s=1 beat, 1s=2 beats)
        useTimelineStore.getState().setTrackOffsetTicks(idA, CANONICAL_PPQ); // 1 beat
        useTimelineStore.getState().setTrackOffsetTicks(idB, 2 * CANONICAL_PPQ); // 2 beats
        const midiA = makeMidi([
            { type: 'noteOn', note: 60, velocity: 100, time: 0.0, tick: 0, channel: 0 },
            { type: 'noteOff', note: 60, velocity: 0, time: 1.0, tick: 1 * CANONICAL_PPQ, channel: 0 },
        ]);
        const PPQ = CANONICAL_PPQ;
        const midiB = makeMidi([
            { type: 'noteOn', note: 64, velocity: 100, time: 0.2, tick: Math.round(0.2 * (PPQ * 2)), channel: 1 },
            { type: 'noteOff', note: 64, velocity: 0, time: 0.7, tick: Math.round(0.7 * (PPQ * 2)), channel: 1 },
        ]);
        useTimelineStore.getState().ingestMidiToCache(idA, buildNotesFromMIDI(midiA));
        useTimelineStore.getState().ingestMidiToCache(idB, buildNotesFromMIDI(midiB));
        const notes = noteQueryApi.getNotesInWindow(useTimelineStore.getState(), [idA, idB], 0, 2);
        expect(notes.map((n) => n.trackId)).toEqual([idA, idB]);
        // Each beat at 120bpm = 0.5s
        const secPerBeat = 0.5;
        const expectedA = 1 * secPerBeat; // offset 1 beat + local 0 beats
        expect(notes[0].startSec).toBeCloseTo(expectedA, 1);
        // Track B: offset 2 beats + local start ~0.2 beats (tick ~0.4*PPQ because we doubled PPQ scaling earlier) => time value from ingestion
        const localStartBeatsB = Math.round(0.2 * (PPQ * 2)) / PPQ; // actual beats represented by tick / PPQ
        const expectedB = 2 * secPerBeat + localStartBeatsB * secPerBeat;
        expect(notes[1].startSec).toBeCloseTo(expectedB, 1);
    });

    it('clips to per-track regions (region ticks)', async () => {
        const id = await useTimelineStore.getState().addMidiTrack({ name: 'R', offsetTicks: 0 });
        const PPQ = CANONICAL_PPQ;
        const midi = makeMidi([
            { type: 'noteOn', note: 60, velocity: 100, time: 0.2, tick: Math.round(0.2 * (PPQ * 2)), channel: 0 },
            { type: 'noteOff', note: 60, velocity: 0, time: 1.2, tick: Math.round(1.2 * (PPQ * 2)), channel: 0 },
        ]);
        useTimelineStore.getState().ingestMidiToCache(id, buildNotesFromMIDI(midi));
        // Region: 0.5s..1.0s => in beats: 0.5s=1 beat (480 ticks) 1.0s=2 beats (960 ticks)
        useTimelineStore.getState().setTrackRegionTicks(id, 1 * CANONICAL_PPQ, 2 * CANONICAL_PPQ);
        const notes = noteQueryApi.getNotesInWindow(useTimelineStore.getState(), [id], 0, 2);
        expect(notes.length).toBe(1);
        expect(notes[0].startSec).toBeLessThan(0.6); // original inside region after clipping still present
        expect(notes[0].endSec).toBeGreaterThan(0.5);
    });

    it('honors solo and mute and supports empty trackIds as all', async () => {
        const idA = await useTimelineStore.getState().addMidiTrack({ name: 'A' });
        const idB = await useTimelineStore.getState().addMidiTrack({ name: 'B' });
        useTimelineStore
            .getState()
            .ingestMidiToCache(
                idA,
                buildNotesFromMIDI(
                    makeMidi([{ type: 'noteOn', note: 60, velocity: 100, time: 0, tick: 0, channel: 0 }])
                )
            );
        useTimelineStore
            .getState()
            .ingestMidiToCache(
                idB,
                buildNotesFromMIDI(
                    makeMidi([{ type: 'noteOn', note: 62, velocity: 100, time: 0, tick: 0, channel: 1 }])
                )
            );
        useTimelineStore.getState().setTrackMute(idA, true);
        useTimelineStore.getState().setTrackSolo(idB, true);
        const notes = noteQueryApi.getNotesInWindow(useTimelineStore.getState(), [], 0, 0.1);
        expect(notes.length).toBe(1);
        expect(notes[0].trackId).toBe(idB);
        expect(notes[0].note).toBe(62);
    });
});
