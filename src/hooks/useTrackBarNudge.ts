import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';

// Nudge a given track's offset by +/- N bars using canonical tick domain
export default function useTrackBarNudge(trackId: string, bars: number = 1) {
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setOffsetTicks = useTimelineStore((s) => s.setTrackOffsetTicks);
    const offsetTicks = useTimelineStore((s) => s.tracks[trackId]?.offsetTicks || 0);
    const ticksPerQuarter = CANONICAL_PPQ;

    return useCallback(
        (dir: 1 | -1) => {
            const ticksPerBar = beatsPerBar * ticksPerQuarter;
            const next = Math.max(0, offsetTicks + dir * bars * ticksPerBar);
            setOffsetTicks(trackId, next);
        },
        [trackId, offsetTicks, setOffsetTicks, beatsPerBar, bars]
    );
}
