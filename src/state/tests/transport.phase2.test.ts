import { describe, it, expect } from 'vitest';
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
        transport: { isPlaying: false, loopEnabled: false, rate: 1.0, quantize: 'off' },
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
        setRate: () => {},
        setQuantize: () => {},
        setLoopEnabled: () => {},
        setLoopRange: () => {},
        reorderTracks: () => {},
        setTimelineView: () => {},
        selectTracks: () => {},
        ingestMidiToCache: () => {},
        ...(partial as any),
    };
}

describe('Phase 2 transport additions', () => {
    it('has defaults for rate and quantize', () => {
        const s = makeState();
        expect(s.transport.rate).toBe(1);
        expect(s.transport.quantize).toBe('off');
    });
});
