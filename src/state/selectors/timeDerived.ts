import { useTimelineStore } from '../timelineStore';
import { secondsToBeats, beatsToSeconds } from '@core/timing/tempo-utils';
import { TimingManager } from '@core/timing';

// Singleton timing manager (reuse existing one if exported differently later)
const _tm = new TimingManager();

function getSPB(state: any) {
    return 60 / (state.timeline.globalBpm || 120);
}

export const useCurrentTick = () => useTimelineStore((s) => s.timeline.currentTick);

export const useCurrentTimeSeconds = () =>
    useTimelineStore((s) => {
        const spb = getSPB(s);
        const beats = s.timeline.currentTick / _tm.ticksPerQuarter;
        return beatsToSeconds(s.timeline.masterTempoMap, beats, spb);
    });

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
        if (!pr) return {};
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
