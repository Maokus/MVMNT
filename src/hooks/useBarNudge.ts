import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { secondsToBeatsSelector, beatsToSecondsSelector } from '@state/selectors/timing';

export default function useBarNudge(bars: number = 1) {
    const current = useTimelineStore((s) => s.timeline.currentTimeSec);
    const setCurrent = useTimelineStore((s) => s.setCurrentTimeSec);
    const masterTempo = useTimelineStore((s) => s.timeline.masterTempoMap);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);

    return useCallback(
        (dir: 1 | -1) => {
            // Use selectors for consistent conversions and store-backed meter
            const state = useTimelineStore.getState();
            const beats = secondsToBeatsSelector(state, current);
            const nextBeats = beats + dir * bars * (beatsPerBar || 4);
            const nextSec = beatsToSecondsSelector(state, nextBeats);
            setCurrent(nextSec);
        },
        [current, setCurrent, masterTempo, beatsPerBar, globalBpm, bars]
    );
}
