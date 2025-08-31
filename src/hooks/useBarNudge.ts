import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { secondsToBeatsWithMap, beatsToSecondsWithMap } from '@core/timing/timeline-helpers';

export default function useBarNudge(bars: number = 1) {
    const current = useTimelineStore((s) => s.timeline.currentTimeSec);
    const setCurrent = useTimelineStore((s) => s.setCurrentTimeSec);
    const masterTempo = useTimelineStore((s) => s.timeline.masterTempoMap);

    return useCallback(
        (dir: 1 | -1) => {
            const beats = secondsToBeatsWithMap(masterTempo, current);
            const nextBeats = beats + dir * bars * 4; // assume 4 beats per bar default
            const nextSec = beatsToSecondsWithMap(masterTempo, nextBeats);
            setCurrent(nextSec);
        },
        [current, setCurrent, masterTempo, bars]
    );
}
