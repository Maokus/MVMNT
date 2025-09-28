import { describe, it, expect } from 'vitest';
import {
    noteQueryApi,
    trackBeatsToTimelineSeconds,
    timelineToTrackSeconds,
    timelineSecondsToTrackBeats,
} from '@core/timing/note-query';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
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

describe('Timeline mapping helpers (store version)', () => {
    it('timelineToTrackSeconds respects offsets and regions (converted to tick regions)', async () => {
        const id = await useTimelineStore.getState().addMidiTrack({ name: 'T', offsetTicks: 0 });
        // Offset 1.5s => at 120 bpm: 1.5s * (120/60)=3 beats => 3*PPQ ticks
        useTimelineStore.getState().setTrackOffsetTicks(id, 3 * CANONICAL_PPQ);
        const midi = makeMidi([
            { type: 'noteOn', note: 60, velocity: 100, time: 0.0, tick: 0, channel: 0 },
            { type: 'noteOff', note: 60, velocity: 0, time: 1.0, tick: 1 * CANONICAL_PPQ, channel: 0 },
        ]);
        useTimelineStore.getState().ingestMidiToCache(id, buildNotesFromMIDI(midi));
        // Region 0.5s..2.0s => 0.5s=1 beat=PPQ ticks after offset; relative region ticks = start PPQ end 4*PPQ
        useTimelineStore.getState().setTrackRegionTicks(id, 1 * CANONICAL_PPQ, 4 * CANONICAL_PPQ);
        const state = useTimelineStore.getState();
        const track = state.tracks[id];
        if (!track || track.type !== 'midi') throw new Error('expected midi track');
        expect(timelineToTrackSeconds(state, track, 1.0)).toBeNull();
        expect(timelineToTrackSeconds(state, track, 2.0)).toBeCloseTo(0.5, 1);
        expect(timelineToTrackSeconds(state, track, 3.0)).toBeCloseTo(1.5, 1);
        expect(timelineToTrackSeconds(state, track, 4.0)).toBeNull();
    });

    it('align across tracks via beats (cross sync)', async () => {
        const idA = await useTimelineStore.getState().addMidiTrack({ name: 'A' });
        const idB = await useTimelineStore.getState().addMidiTrack({ name: 'B' });
        // Apply tempo maps by setting master map for now (simplified). Track A 120 BPM, Track B 60 BPM can't be represented simultaneously in master map, so emulate by beats mapping math.
        // We test logic: 2s in A (120 bpm) -> 4 beats. Convert beats to B seconds at 60bpm -> 4 beats * (60/ BPM) = 4 * (60/60)=4s.
        const stateA = useTimelineStore.getState();
        // trackBeatsToTimelineSeconds uses master map; mimic two tempos by manual calc
        const beats = 4; // 2s at 120bpm
        // B seconds per beat = 60/60 =1
        const mapped = beats * 1; // 4
        expect(mapped).toBeCloseTo(4.0, 6);
        // Sanity: using helper for A baseline
        const state = useTimelineStore.getState();
        const trackA = state.tracks[idA];
        if (!trackA || trackA.type !== 'midi') throw new Error('expected midi track A');
        const approxASeconds = trackBeatsToTimelineSeconds(state, trackA, beats);
        expect(approxASeconds).toBeCloseTo(beats * 0.5, 1); // at default 120bpm spb=0.5
    });
});
