import { useEffect } from 'react';
import { useTimelineStore } from '@state/timelineStore';

interface UseAutoFollowOptions {
    follow: boolean;
}

/**
 * Keeps the playhead in view during playback by nudging the timeline window
 * when the playhead exits the inner 10–85% of the visible range.
 */
export function useAutoFollow({ follow }: UseAutoFollowOptions) {
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const view = useTimelineStore((s) => s.timelineView);
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);

    useEffect(() => {
        if (!follow || !isPlaying) return;
        const range = Math.max(1, view.endTick - view.startTick);
        const left = view.startTick + range * 0.1;
        const right = view.startTick + range * 0.85;
        if (currentTick < left) {
            const newStart = currentTick - range * 0.3;
            setTimelineViewTicks(newStart, newStart + range);
        } else if (currentTick > right) {
            const newStart = currentTick - range * 0.7;
            setTimelineViewTicks(newStart, newStart + range);
        }
    }, [currentTick, follow, isPlaying, view.startTick, view.endTick, setTimelineViewTicks]);
}
