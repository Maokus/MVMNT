import { useTimelineStore } from '@state/timelineStore';
import type { TempoMapEntry } from './types';
import { TimingManager } from './timing-manager';
import { secondsToBeats, beatsToSeconds } from './tempo-utils';

// Pure function utilities (no hooks) to debug the timing system

export function getTimingState() {
    const s = useTimelineStore.getState();
    return {
        globalBpm: s.timeline.globalBpm,
        beatsPerBar: s.timeline.beatsPerBar,
        currentTick: s.timeline.currentTick,
        masterTempoMap: s.timeline.masterTempoMap,
        tracks: s.tracks,
        tracksOrder: s.tracksOrder,
    };
}

export function setGlobalBpm(bpm: number) {
    useTimelineStore.getState().setGlobalBpm(bpm);
}

export function setBeatsPerBar(n: number) {
    useTimelineStore.getState().setBeatsPerBar(n);
}

export function setMasterTempoMap(map?: TempoMapEntry[]) {
    useTimelineStore.getState().setMasterTempoMap(map);
}

export function setCurrentTick(tick: number) {
    useTimelineStore.getState().setCurrentTick(tick, 'user');
}

// Direct conversion helpers (aliases) using canonical tick-domain state.
// These remain for console debugging convenience only.
export function s2b(seconds: number) {
    const s = useTimelineStore.getState();
    const spb = 60 / (s.timeline.globalBpm || 120);
    return secondsToBeats(s.timeline.masterTempoMap, seconds, spb);
}

export function b2s(beats: number) {
    const s = useTimelineStore.getState();
    const spb = 60 / (s.timeline.globalBpm || 120);
    return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
}

export function s2bars(seconds: number) {
    const s = useTimelineStore.getState();
    const beats = s2b(seconds);
    return beats / (s.timeline.beatsPerBar || 4);
}

export function bars2s(bars: number) {
    const s = useTimelineStore.getState();
    const beats = bars * (s.timeline.beatsPerBar || 4);
    return b2s(beats);
}

export function getBeatGrid(startSec: number, endSec: number) {
    // use TimingManager's precise grid when needed; quick approximation via selectors
    const s = useTimelineStore.getState();
    const tm = new TimingManager('debug');
    tm.setBPM(s.timeline.globalBpm);
    tm.setBeatsPerBar(s.timeline.beatsPerBar);
    if (s.timeline.masterTempoMap) tm.setTempoMap(s.timeline.masterTempoMap, 'seconds');
    return tm.getBeatGridInWindow(startSec, endSec);
}

// Attach to window for quick dev usage
export const debugTools = {
    getTimingState,
    setGlobalBpm,
    setBeatsPerBar,
    setMasterTempoMap,
    setCurrentTick,
    s2b,
    b2s,
    s2bars,
    bars2s,
    getBeatGrid,
};
