import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';

// Minimal fake MIDIData shape
const makeMidiData = (events: any[]) => ({
    events,
    duration: 0,
    tempo: 500000,
    ticksPerQuarter: 480,
    timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
    trimmedTicks: 0,
});

describe('tempo scaling (beats canonical)', () => {
    it('changing BPM changes real-time length but not beat length', async () => {
        const api = useTimelineStore;
        // One whole note (4 beats) from ticks 0 -> 1920 at 480 tpq
        const midiData = makeMidiData([
            { type: 'noteOn', note: 60, channel: 0, velocity: 100, time: 0, tick: 0 },
            { type: 'noteOff', note: 60, channel: 0, velocity: 0, time: 2, tick: 1920 }, // time is placeholder
        ]);

        const trackId = await api.getState().addMidiTrack({ name: 'Test', midiData });
        const cache = api.getState().midiCache[trackId];
        expect(cache).toBeTruthy();
        const note = cache.notesRaw[0];
        // At default 120 bpm, secondsPerBeat = 0.5, 4 beats => 2 seconds
        expect(Math.round((note.endTime - note.startTime) * 1000)).toBe(2000); // ~2s

        // Change BPM to 60 (secondsPerBeat = 1) => expected duration 4s
        api.getState().setGlobalBpm(60);
        const noteAfter = api.getState().midiCache[trackId].notesRaw[0];
        expect(Math.round(noteAfter.endTime - noteAfter.startTime)).toBe(4);
        // Beat distance constant
        expect(noteAfter.endBeat! - noteAfter.startBeat!).toBeCloseTo(4, 1e-6);
    });
});
