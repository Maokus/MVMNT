import { useCallback } from 'react';
import { useTimelineViewSeconds } from '@state/selectors/timeDerived';

interface TimeScaleView {
    startSec: number;
    endSec: number;
}

// Shared time scale mapping used by ruler and lanes.
// Maps seconds <-> x px based on current timelineView with small display padding.
export function useTimeScale() {
    const timelineViewSec = useTimelineViewSeconds(); // { start, end }
    const startSec = typeof timelineViewSec.start === 'number' ? timelineViewSec.start : 0;
    const endSec = typeof timelineViewSec.end === 'number' ? timelineViewSec.end : startSec + 1;
    const view: TimeScaleView = { startSec, endSec };
    const rawRange = Math.max(0.001, endSec - startSec);
    const pad = Math.max(0.05, rawRange * 0.005);
    const dispStart = startSec - pad;
    const dispEnd = endSec + pad;
    const rangeSec = Math.max(0.001, dispEnd - dispStart);
    const toSeconds = useCallback(
        (x: number, width: number) => {
            const raw = dispStart + (Math.min(Math.max(0, x), width) / Math.max(1, width)) * rangeSec;
            return Math.min(Math.max(raw, startSec), endSec);
        },
        [dispStart, rangeSec, startSec, endSec]
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
