import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { noteQueryApi } from '../note-query';

function resetStore() {
    const s = useTimelineStore.getState();
    s.clearAllTracks();
    // reset tick etc
    useTimelineStore.setState({ timeline: { ...s.timeline, currentTick: 0 } });
}

describe('note-query utilities', () => {
    beforeEach(() => resetStore());

    it('ingests midi track and queries notes in window', async () => {
        const events = [
            { type: 'noteOn', note: 60, time: 0, tick: 0, channel: 0, velocity: 100 },
            { type: 'noteOff', note: 60, time: 1, tick: 480, channel: 0, velocity: 0 },
            { type: 'noteOn', note: 64, time: 2, tick: 960, channel: 0, velocity: 100 },
            { type: 'noteOff', note: 64, time: 3, tick: 1440, channel: 0, velocity: 0 },
        ] as any;
        const midiData = {
            events,
            duration: 3,
            tempo: 500000, // 120 bpm
            ticksPerQuarter: 480,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
        } as any;

        const id = await useTimelineStore.getState().addMidiTrack({ name: 'T', midiData });

        const state = useTimelineStore.getState();
        // Window covering entire 0-4s range (approx 120bpm => 0.5s per beat)
        const notes = noteQueryApi.getNotesInWindow(state, [id], 0, 5);
        expect(notes.length).toBe(2);
        expect(notes[0].note).toBe(60);
        expect(notes[1].note).toBe(64);
    });

    it('track offset shifts absolute note times', async () => {
        const events = [
            { type: 'noteOn', note: 72, time: 0, tick: 0, channel: 0, velocity: 100 },
            { type: 'noteOff', note: 72, time: 1, tick: 480, channel: 0, velocity: 0 },
        ] as any;
        const midiData = {
            events,
            duration: 1,
            tempo: 500000,
            ticksPerQuarter: 480,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
        } as any;
        const id = await useTimelineStore.getState().addMidiTrack({ name: 'O', midiData, offsetTicks: 480 }); // 1 beat offset
        const state = useTimelineStore.getState();
        const notes = noteQueryApi.getNotesInWindow(state, [id], 0, 5);
        expect(notes.length).toBe(1);
        const first = notes[0];
        // 1 beat offset at 120bpm = 0.5s shift
        expect(first.startSec).toBeGreaterThan(0.45);
        expect(first.startSec).toBeLessThan(0.55);
    });
});
