import { describe, it, expect } from 'vitest';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { MIDIData } from '@core/types';
import { useTimelineStore } from '../timelineStore';
import { selectNotesForTrackSeconds } from '../selectors/timelineSelectors';

function makeMidi(ppq: number, noteStartBeats: number, noteDurationBeats: number): MIDIData {
    const startTick = Math.round(noteStartBeats * ppq);
    const endTick = startTick + Math.round(noteDurationBeats * ppq);
    return {
        events: [
            { type: 'noteOn', note: 60, channel: 0, velocity: 100, time: 0, tick: startTick },
            { type: 'noteOff', note: 60, channel: 0, velocity: 0, time: 0, tick: endTick },
        ],
        duration: 0,
        tempo: 120,
        ticksPerQuarter: ppq,
        timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
        trimmedTicks: 0,
    } as MIDIData;
}

describe('MIDI ingestion normalization', () => {
    [96, 240, 480].forEach((ppq) => {
        it(`normalizes source PPQ ${ppq} to canonical ${CANONICAL_PPQ}`, () => {
            const midi = makeMidi(ppq, 4, 1); // start at beat 4, 1 beat duration
            const result = buildNotesFromMIDI(midi);
            expect(result.ticksPerQuarter).toBe(CANONICAL_PPQ);
            expect(result.notesRaw.length).toBe(1);
            const n = result.notesRaw[0];
            expect(n.startTick).toBe(Math.round(4 * CANONICAL_PPQ));
            expect(n.durationTicks).toBe(Math.round(1 * CANONICAL_PPQ));
        });
    });

    it('track offset in ticks equals intended beats after normalization', () => {
        const midi = makeMidi(96, 0, 1);
        const result = buildNotesFromMIDI(midi);
        const trackId = 'trk_norm';
        useTimelineStore.setState((prev) => ({
            tracks: {
                ...prev.tracks,
                [trackId]: {
                    id: trackId,
                    name: 'Test',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                },
            },
            tracksOrder: [...prev.tracksOrder, trackId],
        }));
        useTimelineStore.getState().ingestMidiToCache(trackId, result);
        // 1 bar offset (beatsPerBar=4) => 4 beats * canonical PPQ
        const oneBarTicks = 4 * CANONICAL_PPQ;
        useTimelineStore.getState().setTrackOffsetTicks(trackId, oneBarTicks);
        // Validate that effective start time shift is approx one bar's seconds at 120bpm (0.5s per beat -> 2s per bar)
        const events = selectNotesForTrackSeconds(useTimelineStore.getState(), trackId);
        expect(events.length).toBe(1);
        const e = events[0];
        // At 120bpm, 1 beat = 0.5s, 4 beats = 2s
        expect(Math.abs(e.startTime - 2) < 1e-3).toBe(true);
    });
});
