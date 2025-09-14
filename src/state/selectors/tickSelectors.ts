// Phase 1 tick-based selectors (derived from existing seconds domain)
// These will become primary in later phases when store migrates to tick canonical state.

import { useTimelineStore } from '../timelineStore';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { sharedTimingManager } from '../timelineStore';

// Simple shared accessor for current timeline tempo context (fallback bpm + map)
function getSecondsPerBeatCurrent(state: any) {
    const spbFallback = 60 / (state.timeline.globalBpm || 120);
    return spbFallback; // If needed, could inspect tempo map first
}

// Select current playhead as ticks (derived from seconds)
export function useCurrentTick(): number {
    return useTimelineStore((s) => {
        const spb = getSecondsPerBeatCurrent(s);
        const beats = secondsToBeats(s.timeline.masterTempoMap, s.timeline.currentTimeSec, spb);
        // Use existing global ticksPerQuarter from TimingManager default (will align later with canonical PPQ)
        return beats * sharedTimingManager.ticksPerQuarter; // not cached; inexpensive
    });
}

export function selectSecondsForTick(tick: number) {
    const s = useTimelineStore.getState();
    const spb = getSecondsPerBeatCurrent(s);
    const beats = tick / sharedTimingManager.ticksPerQuarter;
    return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
}

// Generic hook for converting arbitrary seconds to ticks within current tempo context
export function useSecondsToTicks(seconds: number): number {
    return useTimelineStore((s) => {
        const spb = getSecondsPerBeatCurrent(s);
        const beats = secondsToBeats(s.timeline.masterTempoMap, seconds, spb);
        return beats * sharedTimingManager.ticksPerQuarter;
    });
}
