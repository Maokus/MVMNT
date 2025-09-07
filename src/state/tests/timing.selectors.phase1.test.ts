import { describe, it, expect } from 'vitest';
import { positionBeats, positionBars, secondsToBeatsSelector, secondsToBars } from '../selectors/timing';
import type { TimelineState } from '../timelineStore';

function makeState(partial?: Partial<TimelineState>): TimelineState {
    return {
        timeline: {
            id: 'tl_1',
            name: 'Test',
            currentTimeSec: 0,
            globalBpm: 120,
            beatsPerBar: 4,
            masterTempoMap: undefined,
        },
        tracks: {},
        tracksOrder: [],
        transport: { isPlaying: false, loopEnabled: false },
        selection: { selectedTrackIds: [] },
        timelineView: { startSec: 0, endSec: 60 },
        midiCache: {},
        addMidiTrack: async () => 'x',
        removeTrack: () => {},
        updateTrack: () => {},
        setTrackOffset: () => {},
        setTrackRegion: () => {},
        setTrackEnabled: () => {},
        setTrackMute: () => {},
        setTrackSolo: () => {},
        setMasterTempoMap: () => {},
        setGlobalBpm: () => {},
        setBeatsPerBar: () => {},
        setCurrentTimeSec: () => {},
        play: () => {},
        pause: () => {},
        togglePlay: () => {},
        scrub: () => {},
        setLoopEnabled: () => {},
        setLoopRange: () => {},
        reorderTracks: () => {},
        setTimelineView: () => {},
        selectTracks: () => {},
        ingestMidiToCache: () => {},
        ...(partial as any),
    };
}

describe('Phase 1 selectors: positionBeats/positionBars', () => {
    it('derives monotonic beats/bars from increasing seconds', () => {
        const s = makeState();
        const times = [0, 0.25, 0.5, 1, 2, 4];
        let lastBeats = -Infinity;
        let lastBars = -Infinity;
        for (const t of times) {
            s.timeline.currentTimeSec = t;
            const b = positionBeats(s);
            const br = positionBars(s);
            expect(b).toBeGreaterThanOrEqual(lastBeats);
            expect(br).toBeGreaterThanOrEqual(lastBars);
            lastBeats = b;
            lastBars = br;
        }
    });

    it('secondsToBeats/secondsToBars work with tempo map start segment', () => {
        const s = makeState({
            timeline: {
                id: 'tl_1',
                name: 'Test',
                currentTimeSec: 0,
                globalBpm: 60, // ignored because map starts at 0
                beatsPerBar: 4,
                masterTempoMap: [
                    { time: 0, bpm: 120 }, // spb = 0.5s
                ],
            },
        });
        const sec = 1; // -> 2 beats at 120
        expect(secondsToBeatsSelector(s, sec)).toBeCloseTo(2, 6);
        expect(secondsToBars(s, sec)).toBeCloseTo(2 / 4, 6);
    });
});
