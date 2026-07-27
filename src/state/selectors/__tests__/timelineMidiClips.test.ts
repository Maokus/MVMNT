import { beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { selectCCInWindow, selectNotesInWindow, selectSustainStateAtTime } from '../timelineSelectors';
import { useTimelineStore, type TimelineTrack } from '@state/timelineStore';
import { computeContentBoundsTicks } from '@state/timeline/timelineShared';

function resetStore() {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.getState().clearAllTracks();
}

function seedMultiClipState() {
    const ppq = CANONICAL_PPQ;
    const track: TimelineTrack = {
        id: 'track1',
        name: 'Track 1',
        type: 'midi',
        enabled: true,
        mute: false,
        solo: false,
        clips: [
            { id: 'clipA', type: 'midi', sourceId: 'sourceA', offsetTicks: 0 },
            { id: 'clipB', type: 'midi', sourceId: 'sourceA', offsetTicks: ppq * 4 },
            {
                id: 'clipTrimmed',
                type: 'midi',
                sourceId: 'sourceB',
                offsetTicks: ppq * 8,
                regionStartTick: ppq,
                regionEndTick: ppq * 2,
            },
        ],
    };
    useTimelineStore.setState((state) => ({
        tracks: { ...state.tracks, [track.id]: track },
        tracksOrder: [track.id],
        midiCache: {
            sourceA: {
                midiData: undefined as any,
                notesRaw: [
                    { note: 60, channel: 0, startTick: 0, endTick: ppq, durationTicks: ppq },
                    { note: 64, channel: 0, startTick: ppq * 2, endTick: ppq * 3, durationTicks: ppq },
                ],
                ccRaw: [
                    { channel: 0, controller: 64, value: 127, tick: 0 },
                    { channel: 0, controller: 64, value: 0, tick: ppq * 2 },
                ],
                ticksPerQuarter: ppq,
                bounds: { minTick: 0, maxTick: ppq * 3, minNote: 60, maxNote: 64, maxDurationTicks: ppq },
            },
            sourceB: {
                midiData: undefined as any,
                notesRaw: [
                    { note: 70, channel: 0, startTick: 0, endTick: ppq, durationTicks: ppq },
                    { note: 72, channel: 0, startTick: ppq, endTick: ppq * 2, durationTicks: ppq },
                    { note: 74, channel: 0, startTick: ppq * 2, endTick: ppq * 3, durationTicks: ppq },
                ],
                ccRaw: [{ channel: 0, controller: 1, value: 99, tick: ppq }],
                ticksPerQuarter: ppq,
                bounds: { minTick: 0, maxTick: ppq * 3, minNote: 70, maxNote: 74, maxDurationTicks: ppq },
            },
        },
    }));
}

describe('timeline MIDI clip selectors', () => {
    beforeEach(() => resetStore());

    it('returns notes from multiple clips on one track with clip metadata', () => {
        seedMultiClipState();

        const notes = selectNotesInWindow(useTimelineStore.getState(), {
            trackIds: ['track1'],
            startSec: 0,
            endSec: 10,
        });

        expect(notes.map((note) => [note.note, note.clipId, note.sourceId])).toEqual([
            [60, 'clipA', 'sourceA'],
            [64, 'clipA', 'sourceA'],
            [60, 'clipB', 'sourceA'],
            [64, 'clipB', 'sourceA'],
            [72, 'clipTrimmed', 'sourceB'],
        ]);
    });

    it('does not duplicate shared source cache data beyond clip placements', () => {
        seedMultiClipState();

        const sourceCount = Object.keys(useTimelineStore.getState().midiCache).length;
        const notes = selectNotesInWindow(useTimelineStore.getState(), {
            trackIds: ['track1'],
            startSec: 0,
            endSec: 10,
        });

        expect(sourceCount).toBe(2);
        expect(notes.filter((note) => note.sourceId === 'sourceA')).toHaveLength(4);
    });

    it('queries region-trimmed clips by local tick bounds', () => {
        seedMultiClipState();

        const notes = selectNotesInWindow(useTimelineStore.getState(), {
            trackIds: ['track1'],
            startSec: 4,
            endSec: 6,
        });

        expect(notes.map((note) => note.note)).toEqual([72]);
    });

    it('returns CC and sustain events across clips', () => {
        seedMultiClipState();

        const cc = selectCCInWindow(useTimelineStore.getState(), { trackIds: ['track1'], startSec: 0, endSec: 10 });

        expect(cc.map((event) => [event.controller, event.value, event.clipId])).toEqual([
            [64, 127, 'clipA'],
            [64, 0, 'clipA'],
            [64, 127, 'clipB'],
            [64, 0, 'clipB'],
            [1, 99, 'clipTrimmed'],
        ]);
        expect(selectSustainStateAtTime(useTimelineStore.getState(), { trackIds: ['track1'], timeSec: 2.1 })).toBe(
            true
        );
        expect(selectSustainStateAtTime(useTimelineStore.getState(), { trackIds: ['track1'], timeSec: 3.1 })).toBe(
            false
        );
    });

    it('content bounds include all MIDI clips', () => {
        seedMultiClipState();

        expect(computeContentBoundsTicks(useTimelineStore.getState())).toEqual({
            start: 0,
            end: CANONICAL_PPQ * 10,
        });
    });
});
