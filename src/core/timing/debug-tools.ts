import { useTimelineStore } from '@state/timelineStore';
import { secondsToBeatsSelector, beatsToSecondsSelector, secondsToBars, barsToSeconds } from '@state/selectors/timing';
import type { TempoMapEntry } from './types';

// Pure function utilities (no hooks) to debug the timing system

export function getTimingState() {
    const s = useTimelineStore.getState();
    return {
        globalBpm: s.timeline.globalBpm,
        beatsPerBar: s.timeline.beatsPerBar,
        currentTimeSec: s.timeline.currentTimeSec,
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

export function setCurrentTimeSec(t: number) {
    useTimelineStore.getState().setCurrentTimeSec(t);
}

export function s2b(seconds: number) {
    const s = useTimelineStore.getState();
    return secondsToBeatsSelector(s, seconds);
}

export function b2s(beats: number) {
    const s = useTimelineStore.getState();
    return beatsToSecondsSelector(s, beats);
}

export function s2bars(seconds: number) {
    const s = useTimelineStore.getState();
    return secondsToBars(s, seconds);
}

export function bars2s(bars: number) {
    const s = useTimelineStore.getState();
    return barsToSeconds(s, bars);
}

export function getBeatGrid(startSec: number, endSec: number) {
    // use TimingManager's precise grid when needed; quick approximation via selectors
    const { TimingManager } = require('./timing-manager');
    const s = useTimelineStore.getState();
    const tm = new TimingManager('debug');
    tm.setBPM(s.timeline.globalBpm);
    tm.setBeatsPerBar(s.timeline.beatsPerBar);
    if (s.timeline.masterTempoMap) tm.setTempoMap(s.timeline.masterTempoMap, 'seconds');
    return tm.getBeatGridInWindow(startSec, endSec);
}

// Attach to window for quick dev usage
declare global {
    interface Window {
        __mvmntDebug?: any;
    }
}

if (typeof window !== 'undefined') {
    (window as any).__mvmntDebug = {
        getTimingState,
        setGlobalBpm,
        setBeatsPerBar,
        setMasterTempoMap,
        setCurrentTimeSec,
        s2b,
        b2s,
        s2bars,
        bars2s,
        getBeatGrid,
    };
}

export default {
    getTimingState,
    setGlobalBpm,
    setBeatsPerBar,
    setMasterTempoMap,
    setCurrentTimeSec,
    s2b,
    b2s,
    s2bars,
    bars2s,
    getBeatGrid,
};
