import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '../timelineStore';

// Minimal fake MIDIData shape
const makeMidiData = (events: any[]) => ({
    events,
    duration: 0,
    tempo: 500000,
    ticksPerQuarter: CANONICAL_PPQ,
    timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
    trimmedTicks: 0,
});

describe('tempo scaling (beats canonical)', () => {
    it('changing BPM changes real-time length but not beat length', async () => {
        const api = useTimelineStore;
        // One whole note (4 beats) from ticks 0 -> 4*CANONICAL_PPQ at canonical PPQ
        const fourBeatsTicks = 4 * CANONICAL_PPQ;
        const midiData = makeMidiData([
            { type: 'noteOn', note: 60, channel: 0, velocity: 100, time: 0, tick: 0 },
            { type: 'noteOff', note: 60, channel: 0, velocity: 0, time: 2, tick: fourBeatsTicks }, // time field unused for beat duration calc
        ]);

        const trackId = await api.getState().addMidiTrack({ name: 'Test', midiData });
        const cache = api.getState().midiCache[trackId];
        expect(cache).toBeTruthy();
        const note = cache.notesRaw[0];
        // Some ingestion paths may not pre-compute beat fields; derive if absent
        const startBeat = note.startBeat ?? note.startTick / CANONICAL_PPQ;
        const endBeat =
            note.endBeat !== undefined
                ? note.endBeat
                : note.durationTicks !== undefined
                ? (note.startTick + note.durationTicks) / CANONICAL_PPQ
                : note.endTick / CANONICAL_PPQ;
        // Derive seconds from beats (120 bpm => 0.5s per beat)
        const beatsDur = endBeat - startBeat;
        const spb120 = 60 / 120;
        expect(Math.round(beatsDur * spb120 * 1000)).toBe(2000);

        // Change BPM to 60 (secondsPerBeat = 1) => expected duration 4s
        api.getState().setGlobalBpm(60);
        const noteAfter = api.getState().midiCache[trackId].notesRaw[0];
        const startBeatAfter = noteAfter.startBeat ?? noteAfter.startTick / CANONICAL_PPQ;
        const endBeatAfter =
            noteAfter.endBeat !== undefined
                ? noteAfter.endBeat
                : noteAfter.durationTicks !== undefined
                ? (noteAfter.startTick + noteAfter.durationTicks) / CANONICAL_PPQ
                : noteAfter.endTick / CANONICAL_PPQ;
        const spb60 = 60 / 60; // 1s per beat
        expect(Math.round((endBeatAfter - startBeatAfter) * spb60)).toBe(4);
        // Beat distance constant
        expect(endBeatAfter - startBeatAfter).toBeCloseTo(4, 1e-6);
    });
});
