import { useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';

// Shared time scale mapping used by ruler and lanes.
// Maps seconds <-> x px based on current timelineView with small display padding.
export function useTimeScale() {
    const view = useTimelineStore((s) => s.timelineView);
    const rawRange = Math.max(0.001, view.endSec - view.startSec);
    const pad = Math.max(0.2, rawRange * 0.02);
    // Allow negative pre-roll: do not clamp display start to 0 here.
    const dispStart = view.startSec - pad;
    const dispEnd = view.endSec + pad;
    const rangeSec = Math.max(0.001, dispEnd - dispStart);
    const toSeconds = useCallback(
        (x: number, width: number) => {
            const raw = dispStart + (Math.min(Math.max(0, x), width) / Math.max(1, width)) * rangeSec;
            return Math.min(Math.max(raw, view.startSec), view.endSec);
        },
        [dispStart, rangeSec, view.startSec, view.endSec]
    );
    const toX = useCallback(
        (sec: number, width: number) => {
            const t = (sec - dispStart) / rangeSec;
            return t * Math.max(1, width);
        },
        [dispStart, rangeSec]
    );
    return { view, toSeconds, toX };
}
