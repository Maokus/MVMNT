import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';

// Nudge playhead by whole bars in tick domain (Phase 5)
export default function useBarNudge(bars: number = 1) {
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const setCurrentTick = useTimelineStore((s) => s.setCurrentTick);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const ticksPerQuarter = 960; // TODO: source from TimingManager singleton if made dynamic

    return useCallback(
        (dir: 1 | -1) => {
            const ticksPerBar = beatsPerBar * ticksPerQuarter;
            const next = Math.max(0, currentTick + dir * bars * ticksPerBar);
            setCurrentTick(next);
        },
        [currentTick, setCurrentTick, beatsPerBar, bars]
    );
}
