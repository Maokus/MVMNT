import { describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { TimelineState } from '@state/timelineStore';
import {
    copyTimelineSelectionToMidiClipClipboard,
    copyTimelineSelectionToClipboard,
    getTimelineClipDuplicateDestination,
    prepareMidiClipPaste,
    prepareTimelineClipPaste,
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
                bounds: { minTick: 0, maxTick: CANONICAL_PPQ, minNote: 60, maxNote: 60, maxDurationTicks: CANONICAL_PPQ },
            },
        },
    } as unknown as TimelineState;
}

describe('midiClipClipboard', () => {
    it('copies selected clips with an anchor tick and prepares point-selection paste offsets', () => {
        setMidiClipClipboard(null);
        const copied = copyTimelineSelectionToMidiClipClipboard(state(), {
            type: 'range',
            range: { startTick: CANONICAL_PPQ, endTick: CANONICAL_PPQ * 4, trackIds: ['track1'] },
        });

        expect(copied?.anchorTick).toBe(CANONICAL_PPQ);
        expect(copied?.clips.map((clip) => clip.sourceClipId)).toEqual(['clip1', 'clip2']);
        expect(copied?.sources?.map((source) => source.sourceId)).toEqual(['source1']);

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
        const copied = copyTimelineSelectionToMidiClipClipboard(
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
            {
                type: 'range',
                range: { startTick: CANONICAL_PPQ, endTick: CANONICAL_PPQ * 2, trackIds: ['track1', 'track3'] },
            },
        );

        const prepared = copied
            ? prepareMidiClipPaste(state(), copied, { trackId: 'track2', tick: 0 })
            : null;

        expect(prepared?.createTracks).toHaveLength(1);
        expect(prepared?.clips.map((entry) => entry.trackId)).toEqual(['track2', prepared?.createTracks[0].trackId]);
    });

    it('prepares paste after cut removes the last clip using a MIDI source', () => {
        const copied = copyTimelineSelectionToMidiClipClipboard(state(), {
            type: 'clips',
            clips: [{ trackId: 'track1', clipId: 'clip1' }],
        });
        const postCutState = {
            ...state(),
            tracks: {
                ...state().tracks,
                track1: {
                    ...state().tracks.track1,
                    clips: [],
                },
            },
            midiCache: {},
        } as TimelineState;

        const prepared = copied
            ? prepareMidiClipPaste(postCutState, copied, { trackId: 'track2', tick: CANONICAL_PPQ * 8 })
            : null;

        expect(prepared?.midiCache?.map((entry) => entry.key)).toEqual(['source1']);
        expect(prepared?.clips).toHaveLength(1);
        expect(prepared?.clips[0].clip.sourceId).toBe('source1');
        expect(prepared?.clips[0].clip.offsetTicks).toBe(CANONICAL_PPQ * 8);
    });

    it('places a cropped audio duplicate at its tempo-aware audible end', () => {
        const audioState = {
            ...state(),
            timeline: {
                globalBpm: 120,
                beatsPerBar: 4,
                masterTempoMap: [{ time: 0, bpm: 120 }, { time: 2, bpm: 60 }],
            },
            tracks: {
                audio: {
                    id: 'audio', name: 'Audio', type: 'audio', enabled: true, mute: false, solo: false, gain: 1,
                    clips: [{
                        id: 'audioClip', type: 'audio', sourceId: 'audioSource', offsetTicks: 3 * CANONICAL_PPQ,
                        sourceStartSeconds: 1, sourceEndSeconds: 3,
                    }],
                },
            },
            tracksOrder: ['audio'],
            audioCache: {
                audioSource: { durationSeconds: 4, durationSamples: 192000, durationTicks: 7680, sampleRate: 48000, channels: 1 },
            },
        } as unknown as TimelineState;
        const copied = copyTimelineSelectionToClipboard(audioState, {
            type: 'clips', clips: [{ trackId: 'audio', clipId: 'audioClip', kind: 'audio' }],
        });
        // Original audible end: base 1.5s + source end 3s = 4.5s => tick 6240.
        const prepared = copied ? prepareTimelineClipPaste(audioState, copied, { trackId: 'audio', tick: 6240 }) : null;
        expect(prepared?.audioClips[0].clip.offsetTicks).toBe(5280);
    });

    it('places a MIDI duplicate immediately after its visible end', () => {
        const midiState = {
            ...state(),
            timeline: { globalBpm: 120, beatsPerBar: 4 },
            midiCache: {
                source1: {
                    ...state().midiCache.source1,
                    bounds: {
                        minTick: CANONICAL_PPQ / 2,
                        maxTick: CANONICAL_PPQ * 2,
                        minNote: 60,
                        maxNote: 60,
                        maxDurationTicks: CANONICAL_PPQ,
                    },
                },
            },
            tracks: {
                track1: {
                    ...state().tracks.track1,
                    clips: [{ id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: CANONICAL_PPQ }],
                },
            },
            tracksOrder: ['track1'],
        } as unknown as TimelineState;
        const copied = copyTimelineSelectionToClipboard(midiState, {
            type: 'clips', clips: [{ trackId: 'track1', clipId: 'clip1', kind: 'midi' }],
        });
        const destination = copied ? getTimelineClipDuplicateDestination(midiState, copied) : null;
        const prepared = copied && destination ? prepareTimelineClipPaste(midiState, copied, destination) : null;

        expect(destination).toEqual({ trackId: 'track1', tick: CANONICAL_PPQ * 2.5 });
        expect(prepared?.midiClips[0].clip.offsetTicks).toBe(CANONICAL_PPQ * 2.5);
    });
});
