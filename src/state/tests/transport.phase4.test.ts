import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';

function resetStore() {
    const api = useTimelineStore;
    // Reset by setting initial state values explicitly
    api.setState(
        {
            timeline: { id: 'tl_1', name: 'Main Timeline', currentTimeSec: 0, globalBpm: 120, beatsPerBar: 4 },
            tracks: {},
            tracksOrder: [],
            transport: { state: 'idle', isPlaying: false, loopEnabled: false, rate: 1.0, quantize: 'bar' },
            selection: { selectedTrackIds: [] },
            midiCache: {},
            timelineView: { startSec: 0, endSec: 60 },
            addMidiTrack: api.getState().addMidiTrack,
            removeTrack: api.getState().removeTrack,
            updateTrack: api.getState().updateTrack,
            setTrackOffset: api.getState().setTrackOffset,
            setTrackRegion: api.getState().setTrackRegion,
            setTrackEnabled: api.getState().setTrackEnabled,
            setTrackMute: api.getState().setTrackMute,
            setTrackSolo: api.getState().setTrackSolo,
            setMasterTempoMap: api.getState().setMasterTempoMap,
            setGlobalBpm: api.getState().setGlobalBpm,
            setBeatsPerBar: api.getState().setBeatsPerBar,
            setCurrentTimeSec: api.getState().setCurrentTimeSec,
            play: api.getState().play,
            pause: api.getState().pause,
            togglePlay: api.getState().togglePlay,
            seek: api.getState().seek,
            scrub: api.getState().scrub,
            setRate: api.getState().setRate,
            setQuantize: api.getState().setQuantize,
            setLoopEnabled: api.getState().setLoopEnabled,
            setLoopRange: api.getState().setLoopRange,
            setLoop: api.getState().setLoop,
            toggleLoop: api.getState().toggleLoop,
            reorderTracks: api.getState().reorderTracks,
            setTimelineView: api.getState().setTimelineView,
            selectTracks: api.getState().selectTracks,
            ingestMidiToCache: api.getState().ingestMidiToCache,
        } as any,
        true
    );
}

describe('Phase 4 transport FSM, quantized seek, and looping', () => {
    it('quantizes play to nearest bar when enabled', () => {
        resetStore();
        const s = useTimelineStore.getState();
        s.setQuantize('bar');
        s.setGlobalBpm(120); // 0.5 sec/beat, 2 sec/bar
        s.setBeatsPerBar(4);
        s.setCurrentTimeSec(2.6); // bars ~ 1.30 -> nearest = 1 bar => 2.0s
        s.play();
        const cur = useTimelineStore.getState().timeline.currentTimeSec;
        expect(Math.abs(cur - 2.0)).toBeLessThan(1e-6);
        expect(useTimelineStore.getState().transport.state).toBe('playing');
    });

    it('seek snaps to bar when quantize is bar', () => {
        resetStore();
        const s = useTimelineStore.getState();
        s.setQuantize('bar');
        s.setGlobalBpm(120); // 2 sec/bar
        s.setBeatsPerBar(4);
        s.seek(3.2); // bars ~ 1.60 -> nearest = 2 bars => 4.0s
        const cur = useTimelineStore.getState().timeline.currentTimeSec;
        expect(Math.abs(cur - 4.0)).toBeLessThan(1e-6);
        expect(useTimelineStore.getState().transport.state).toBe('seeking');
    });

    it('loop wraps exactly to loop start (no quantize on wrap)', () => {
        resetStore();
        const s = useTimelineStore.getState();
        s.setGlobalBpm(120); // 2 sec/bar
        s.setBeatsPerBar(4);
        s.setQuantize('bar');
        s.setLoopEnabled(true);
        s.setLoopRange(2.2, 6.0); // wrap should go to exact start => 2.2s
        s.play();
        // exceed loop end
        s.setCurrentTimeSec(6.1);
        const cur = useTimelineStore.getState().timeline.currentTimeSec;
        expect(Math.abs(cur - 2.2)).toBeLessThan(1e-6);
    });

    it('toggleLoop toggles flag', () => {
        resetStore();
        const s = useTimelineStore.getState();
        expect(s.transport.loopEnabled).toBe(false);
        s.toggleLoop();
        expect(useTimelineStore.getState().transport.loopEnabled).toBe(true);
    });
});
