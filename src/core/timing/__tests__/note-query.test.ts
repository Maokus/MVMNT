import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
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
        const PPQ = CANONICAL_PPQ;
        const events = [
            { type: 'noteOn', note: 60, time: 0, tick: 0, channel: 0, velocity: 100 },
            // 1 beat
            { type: 'noteOff', note: 60, time: 1, tick: 1 * PPQ, channel: 0, velocity: 0 },
            { type: 'noteOn', note: 64, time: 2, tick: 2 * PPQ, channel: 0, velocity: 100 },
            { type: 'noteOff', note: 64, time: 3, tick: 3 * PPQ, channel: 0, velocity: 0 },
        ] as any;
        const midiData = {
            events,
            duration: 3,
            tempo: 500000, // 120 bpm
            ticksPerQuarter: CANONICAL_PPQ,
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
        const PPQ = CANONICAL_PPQ;
        const events = [
            { type: 'noteOn', note: 72, time: 0, tick: 0, channel: 0, velocity: 100 },
            { type: 'noteOff', note: 72, time: 1, tick: 1 * PPQ, channel: 0, velocity: 0 },
        ] as any;
        const midiData = {
            events,
            duration: 1,
            tempo: 500000,
            ticksPerQuarter: CANONICAL_PPQ,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
        } as any;
        const id = await useTimelineStore.getState().addMidiTrack({ name: 'O', midiData, offsetTicks: CANONICAL_PPQ }); // 1 beat offset
        const state = useTimelineStore.getState();
        const notes = noteQueryApi.getNotesInWindow(state, [id], 0, 5);
        expect(notes.length).toBe(1);
        const first = notes[0];
        // 1 beat offset at 120bpm = 0.5s shift
        expect(first.startSec).toBeGreaterThan(0.45);
        expect(first.startSec).toBeLessThan(0.55);
    });

    it('queries manually constructed multi-clip tracks', () => {
        const PPQ = CANONICAL_PPQ;
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                track1: {
                    id: 'track1',
                    name: 'Multi',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [
                        { id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: 0 },
                        { id: 'clip2', type: 'midi', sourceId: 'source1', offsetTicks: PPQ * 4 },
                    ],
                },
            },
            tracksOrder: ['track1'],
            midiCache: {
                source1: {
                    midiData: undefined as any,
                    notesRaw: [{ note: 60, channel: 0, startTick: 0, endTick: PPQ, durationTicks: PPQ }],
                    ccRaw: [],
                    ticksPerQuarter: PPQ,
                    bounds: { minTick: 0, maxTick: PPQ, minNote: 60, maxNote: 60, maxDurationTicks: PPQ },
                },
            },
        }));

        const notes = noteQueryApi.getNotesInWindow(useTimelineStore.getState(), ['track1'], 0, 5);

        expect(notes.map((note) => [note.note, note.clipId, note.sourceId])).toEqual([
            [60, 'clip1', 'source1'],
            [60, 'clip2', 'source1'],
        ]);
        expect(notes[1].startSec).toBeCloseTo(2);
    });
});
