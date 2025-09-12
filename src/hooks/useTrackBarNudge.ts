import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { secondsToBeatsSelector, beatsToSecondsSelector } from '@state/selectors/timing';

// Nudge a given track's offset by +/- N bars
export default function useTrackBarNudge(trackId: string, bars: number = 1) {
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setOffset = useTimelineStore((s) => s.setTrackOffset);
    const trackOffset = useTimelineStore((s) => s.tracks[trackId]?.offsetSec || 0);

    return useCallback(
        (dir: 1 | -1) => {
            const state = useTimelineStore.getState();
            const currentBeats = secondsToBeatsSelector(state, trackOffset);
            const nextBeats = currentBeats + dir * bars * (beatsPerBar || 4);
            const nextSec = Math.max(0, beatsToSecondsSelector(state, nextBeats));
            setOffset(trackId, nextSec);
        },
        [trackId, trackOffset, setOffset, beatsPerBar, bars]
    );
}
