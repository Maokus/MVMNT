import { useTimelineStore } from '../timelineStore';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { sharedTimingManager } from '../timelineStore';

// Singleton timing manager (reuse existing one if exported differently later)
const _tm = sharedTimingManager;

function getSPB(state: any) {
    return 60 / (state.timeline.globalBpm || 120);
}

export const useCurrentTick = () => useTimelineStore((s) => s.timeline.currentTick);

export const useCurrentSeconds = () =>
    useTimelineStore((s) => {
        const spb = getSPB(s);
        const beats = s.timeline.currentTick / _tm.ticksPerQuarter;
        return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
    });

// Backwards compatibility (will be removed in cleanup)
export const useCurrentTimeSeconds = useCurrentSeconds;

export const useLoopRangeSeconds = () =>
    useTimelineStore((s) => {
        const spb = getSPB(s);
        const map = s.timeline.masterTempoMap;
        const toSec = (tick?: number) => {
            if (typeof tick !== 'number') return undefined;
            const beats = tick / _tm.ticksPerQuarter;
            return beatsToSeconds(map, beats, spb);
        };
        return { start: toSec(s.transport.loopStartTick), end: toSec(s.transport.loopEndTick) };
    });

export const usePlaybackRangeSeconds = () =>
    useTimelineStore((s) => {
        const pr = s.playbackRange;
        if (!pr) return {} as { start?: number; end?: number };
        const spb = getSPB(s);
        const map = s.timeline.masterTempoMap;
        const toSec = (tick?: number) => {
            if (typeof tick !== 'number') return undefined;
            return beatsToSeconds(map, tick / _tm.ticksPerQuarter, spb);
        };
        return { start: toSec(pr.startTick), end: toSec(pr.endTick) };
    });

export const useTimelineViewSeconds = () =>
    useTimelineStore((s) => {
        const { startTick, endTick } = s.timelineView;
        const spb = getSPB(s);
        const map = s.timeline.masterTempoMap;
        const toSec = (tick: number) => beatsToSeconds(map, tick / _tm.ticksPerQuarter, spb);
        return { start: toSec(startTick), end: toSec(endTick) };
    });

export const useTrackOffsetSeconds = (trackId: string) =>
    useTimelineStore((s) => {
        const tr = s.tracks[trackId];
        if (!tr) return 0;
        const spb = getSPB(s);
        const beats = tr.offsetTicks / _tm.ticksPerQuarter;
        return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
    });

// Non-hook helper for pure conversions inside tests or non-react modules
export function ticksToSeconds(state: any, tick: number): number {
    const spb = getSPB(state);
    const beats = tick / _tm.ticksPerQuarter;
    return beatsToSeconds(state.timeline.masterTempoMap, beats, spb);
}
