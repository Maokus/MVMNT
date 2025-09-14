// Phase 2 selectors exposing both seconds and tick domains (dual-write).
// After Phase 4 these will be simplified to tick-only canonical forms.

import { useTimelineStore } from '../timelineStore';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { sharedTimingManager } from '../timelineStore';

const tm = sharedTimingManager;

export function useCurrentTickDual(): number {
    return useTimelineStore((s) => {
        if (typeof s.timeline.currentTick === 'number') return s.timeline.currentTick;
        // Fallback derive from seconds if not set (initial load before first setter call)
        const spb = 60 / (s.timeline.globalBpm || 120);
        const beats = secondsToBeats(s.timeline.masterTempoMap, s.timeline.currentTimeSec, spb);
        return Math.round(beats * tm.ticksPerQuarter);
    });
}

export function usePlayheadSecondsDual(): number {
    return useTimelineStore((s) => s.timeline.currentTimeSec);
}

export function useSecondsForTick(tick: number): number {
    return useTimelineStore((s) => {
        const beats = tick / tm.ticksPerQuarter;
        const spb = 60 / (s.timeline.globalBpm || 120);
        return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
    });
}

export function useTicksForSeconds(seconds: number): number {
    return useTimelineStore((s) => {
        const spb = 60 / (s.timeline.globalBpm || 120);
        const beats = secondsToBeats(s.timeline.masterTempoMap, seconds, spb);
        return Math.round(beats * tm.ticksPerQuarter);
    });
}
