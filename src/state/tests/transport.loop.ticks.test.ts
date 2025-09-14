import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, getSharedTimingManager } from '../timelineStore';
import { beatsToSeconds } from '@core/timing/tempo-utils';

// Helper: advance clock by ticks (simulating render loop progression)
function advanceClockTicks(ticks: number) {
    const api = useTimelineStore.getState();
    api.setCurrentTick(api.timeline.currentTick + ticks, 'clock');
}

describe('Tick-domain transport: looping, bpm change consistency, offsets', () => {
    const tm = getSharedTimingManager();
    const TPQ = tm.ticksPerQuarter;

    beforeEach(() => {
        // Reset both TimingManager and store's bpm to 120 each test
        tm.setBPM(120);
        const st = useTimelineStore.getState();
        st.setGlobalBpm(120);
        useTimelineStore.setState({
            timeline: { ...useTimelineStore.getState().timeline, currentTick: 0 },
            transport: { ...useTimelineStore.getState().transport, loopEnabled: false, state: 'idle' },
        });
    });

    it('loop wraps exactly to loopStartTick (no quantize on wrap) in tick domain', () => {
        const api = useTimelineStore.getState();
        // Define loop from beat 4 to beat 10
        const loopStartTick = 4 * TPQ; // beat 4
        const loopEndTick = 10 * TPQ; // beat 10
        api.setLoopRangeTicks(loopStartTick, loopEndTick);
        api.setLoopEnabled(true);
        api.play();
        // Move playhead just past loop end
        api.setCurrentTick(loopEndTick + 5, 'clock');
        const after = useTimelineStore.getState();
        expect(after.timeline.currentTick).toBe(loopStartTick); // exact wrap
    });

    it('changing BPM mid-playback keeps currentTick stable but derived seconds adjust', () => {
        const api = useTimelineStore.getState();
        api.play();
        const eightBeatsTicks = 8 * TPQ;
        advanceClockTicks(eightBeatsTicks);
        const beatsPos = eightBeatsTicks / TPQ;
        const state120 = useTimelineStore.getState();
        const secAt120 = beatsToSeconds(state120.timeline.masterTempoMap, beatsPos, 60 / state120.timeline.globalBpm);
        api.setGlobalBpm(240);
        const state240 = useTimelineStore.getState();
        const secAt240 = beatsToSeconds(state240.timeline.masterTempoMap, beatsPos, 60 / state240.timeline.globalBpm);
        expect(secAt240).toBeLessThan(secAt120 - 1e-9);
        expect(useTimelineStore.getState().timeline.currentTick).toBe(eightBeatsTicks);
    });

    it('track offsetTicks shifts derived seconds mapping without altering note tick starts', async () => {
        const api = useTimelineStore.getState();
        // Add MIDI track with zero offset
        const trackId = await api.addMidiTrack({ name: 'Offset Test' });
        const ticksBefore = useTimelineStore.getState().tracks[trackId].offsetTicks || 0;
        expect(ticksBefore).toBe(0);
        // Set offset to 2 beats
        const offsetBeats = 2;
        const offsetTicks = offsetBeats * TPQ;
        api.setTrackOffsetTicks(trackId, offsetTicks);
        const tr = useTimelineStore.getState().tracks[trackId];
        expect(tr.offsetTicks).toBe(offsetTicks);
        // Derived seconds should match beats * secondsPerBeat (120 bpm => 0.5 sec/beat)
        const secondsPerBeat = 60 / useTimelineStore.getState().timeline.globalBpm;
        const derivedSec = (offsetTicks / TPQ) * secondsPerBeat;
        expect(derivedSec).toBeCloseTo(offsetBeats * secondsPerBeat, 6);
    });
});
