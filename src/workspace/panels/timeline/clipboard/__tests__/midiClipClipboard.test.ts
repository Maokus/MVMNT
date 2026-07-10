import { describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { TimelineState } from '@state/timelineStore';
import {
    copySelectedMidiClipsToClipboard,
    prepareMidiClipPaste,
    setMidiClipClipboard,
} from '../midiClipClipboard';

function state(): TimelineState {
    return {
        tracks: {
            track1: {
                id: 'track1',
                name: 'Lead',
                type: 'midi',
                enabled: true,
                mute: false,
                solo: false,
                clips: [
                    { id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: CANONICAL_PPQ },
                    { id: 'clip2', type: 'midi', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 3 },
                ],
            },
            track2: {
                id: 'track2',
                name: 'Bass',
                type: 'midi',
                enabled: true,
                mute: false,
                solo: false,
                clips: [],
            },
        },
        tracksOrder: ['track1', 'track2'],
        midiCache: {
            source1: {
                midiData: {} as any,
                notesRaw: [],
                ccRaw: [],
                ticksPerQuarter: CANONICAL_PPQ,
            },
        },
    } as unknown as TimelineState;
}

describe('midiClipClipboard', () => {
    it('copies selected clips with an anchor tick and prepares point-selection paste offsets', () => {
        setMidiClipClipboard(null);
        const copied = copySelectedMidiClipsToClipboard(state(), [
            { trackId: 'track1', clipId: 'clip1' },
            { trackId: 'track1', clipId: 'clip2' },
        ]);

        expect(copied?.anchorTick).toBe(CANONICAL_PPQ);
        expect(copied?.clips.map((clip) => clip.sourceClipId)).toEqual(['clip1', 'clip2']);

        const prepared = copied
            ? prepareMidiClipPaste(state(), copied, { trackId: 'track2', tick: CANONICAL_PPQ * 5 })
            : null;

        expect(prepared?.createTracks).toEqual([]);
        expect(prepared?.clips.map((entry) => entry.trackId)).toEqual(['track2', 'track2']);
        expect(prepared?.clips.map((entry) => entry.clip.offsetTicks)).toEqual([
            CANONICAL_PPQ * 5,
            CANONICAL_PPQ * 7,
        ]);
    });

    it('prepares new destination MIDI tracks when the paste spans beyond existing tracks', () => {
        const copied = copySelectedMidiClipsToClipboard(
            {
                ...state(),
                tracks: {
                    ...state().tracks,
                    track3: {
                        id: 'track3',
                        name: 'Pad',
                        type: 'midi',
                        enabled: true,
                        mute: false,
                        solo: false,
                        clips: [{ id: 'clip3', type: 'midi', sourceId: 'source1', offsetTicks: CANONICAL_PPQ }],
                    },
                },
                tracksOrder: ['track1', 'track2', 'track3'],
            },
            [
                { trackId: 'track1', clipId: 'clip1' },
                { trackId: 'track3', clipId: 'clip3' },
            ],
        );

        const prepared = copied
            ? prepareMidiClipPaste(state(), copied, { trackId: 'track2', tick: 0 })
            : null;

        expect(prepared?.createTracks).toHaveLength(1);
        expect(prepared?.clips.map((entry) => entry.trackId)).toEqual(['track2', prepared?.createTracks[0].trackId]);
    });
});
