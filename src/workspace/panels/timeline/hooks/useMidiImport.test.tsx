import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { useMidiImport } from './useMidiImport';

const parseMIDIFileToData = vi.hoisted(() => vi.fn());

vi.mock('@core/midi/midi-library', () => ({ parseMIDIFileToData }));

describe('useMidiImport initial project timing', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.getState().clearAllTracks();
        parseMIDIFileToData.mockResolvedValue({
            events: [
                { type: 'noteOn', note: 60, velocity: 100, channel: 0, time: 1, tick: 1920 },
                { type: 'noteOff', note: 60, velocity: 0, channel: 0, time: 1.5, tick: 2880 },
            ],
            duration: 1.5,
            tempo: 400_000,
            ticksPerQuarter: 960,
            timeSignature: { numerator: 6, denominator: 8, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
            tempoMap: [{ time: 0, tempo: 400_000 }],
            trackDetails: [],
        });
    });

    it('adopts BPM and meter from the first MIDI while preserving its leading silence', async () => {
        const { result } = renderHook(() =>
            useMidiImport({
                requestImportMode: vi.fn(),
                requestTempoImport: vi.fn(),
            })
        );

        await act(async () => {
            await result.current.importMidiFile(new File([new Uint8Array([1])], 'first.mid'));
        });

        const state = useTimelineStore.getState();
        expect(state.timeline.globalBpm).toBe(150);
        expect(state.timeline.timeSignature).toEqual({ numerator: 6, denominator: 8 });
        expect(state.midiTimingImport.pending).toBe(false);
        const track = state.tracks[state.tracksOrder[0]];
        expect(track?.type).toBe('midi');
        if (track?.type !== 'midi') throw new Error('MIDI track missing');
        expect(track.clips?.[0].regionStartTick).toBeUndefined();
        expect(state.midiCache[track.clips![0].sourceId].bounds?.minTick).toBe(1920);

        parseMIDIFileToData.mockResolvedValueOnce({
            ...(state.midiCache[track.clips![0].sourceId].midiData as any),
            tempo: 600_000,
            tempoMap: [{ time: 0, tempo: 600_000 }],
            timeSignature: { numerator: 3, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trackDetails: [],
        });
        await act(async () => {
            await result.current.importMidiFile(new File([new Uint8Array([2])], 'second.mid'));
        });
        expect(useTimelineStore.getState().timeline.globalBpm).toBe(150);
        expect(useTimelineStore.getState().timeline.timeSignature).toEqual({ numerator: 6, denominator: 8 });
    });
});
