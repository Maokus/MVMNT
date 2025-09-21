import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore, type TimelineTrack } from '../timelineStore';
import { act } from '@testing-library/react';

function getState() {
    return useTimelineStore.getState();
}

describe('timelineStore (Phase 1)', () => {
    it('adds a MIDI track and ingests provided MIDI data', async () => {
        const midi = {
            events: [
                { type: 'noteOn', time: 0, note: 60, channel: 0, velocity: 100, tick: 0 },
                { type: 'noteOff', time: 1, note: 60, channel: 0, velocity: 0, tick: 480 },
            ],
            duration: 1,
            tempo: 500000,
            ticksPerQuarter: CANONICAL_PPQ,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
        } as any;

        let id = '';
        await act(async () => {
            id = await getState().addMidiTrack({ name: 'Test', midiData: midi });
        });

        const s = getState();
        expect(s.tracks[id]).toBeTruthy();
        expect(s.midiCache[id]).toBeTruthy();
        expect(s.midiCache[id].notesRaw.length).toBe(1);
        expect(s.tracksOrder.includes(id)).toBe(true);
    });

    it('updates track properties and selection', () => {
        const id = Object.keys(getState().tracks)[0];
        act(() => {
            getState().updateTrack(id, { mute: true });
            getState().selectTracks([id]);
        });
        const s = getState();
        expect(s.tracks[id].mute).toBe(true);
        expect(s.selection.selectedTrackIds).toEqual([id]);
    });
});
