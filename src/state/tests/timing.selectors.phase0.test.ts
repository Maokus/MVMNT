import { describe, it, expect } from 'vitest';
import { secondsToBars, barsToSeconds, secondsToBeatsSelector, beatsToSecondsSelector } from '../selectors/timing';
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

describe('timing selectors Phase 0', () => {
    it('seconds<->beats round-trip with fallback bpm', () => {
        const s = makeState();
        const sec = 2.5; // 2.5s at 120 bpm -> 5 beats
        const beats = secondsToBeatsSelector(s, sec);
        expect(beats).toBeCloseTo(5, 6);
        const sec2 = beatsToSecondsSelector(s, beats);
        expect(sec2).toBeCloseTo(sec, 6);
    });

    it('seconds<->bars round-trip with fallback bpm and 4/4', () => {
        const s = makeState();
        const bars = 2;
        const sec = barsToSeconds(s, bars);
        expect(sec).toBeCloseTo(4 /* beats/bar */ * 2 /* bars */ * (60 / 120), 6);
        const bars2 = secondsToBars(s, sec);
        expect(bars2).toBeCloseTo(bars, 6);
    });
});
