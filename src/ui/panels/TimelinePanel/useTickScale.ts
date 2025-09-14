import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '@state/timelineStore';

interface TickScaleView {
    startTick: number;
    endTick: number;
}

// Tick-based scaling (Phase 5): map ticks <-> x px using timelineView ticks with small padding.
export function useTickScale() {
    const viewTicks = useTimelineStore((s) => s.timelineView); // { startTick, endTick }
    const startTick = viewTicks.startTick;
    const endTick = viewTicks.endTick > startTick ? viewTicks.endTick : startTick + 1;
    const rawRange = Math.max(1, endTick - startTick);
    const pad = Math.max(1, Math.floor(rawRange * 0.01));
    const dispStart = startTick - pad;
    const dispEnd = endTick + pad;
    const rangeTicks = Math.max(1, dispEnd - dispStart);
    const view: TickScaleView = useMemo(() => ({ startTick, endTick }), [startTick, endTick]);
    const toTick = useCallback(
        (x: number, width: number) => {
            const raw = dispStart + (Math.min(Math.max(0, x), width) / Math.max(1, width)) * rangeTicks;
            return Math.min(Math.max(Math.round(raw), startTick), endTick);
        },
        [dispStart, rangeTicks, startTick, endTick]
    );
    const toX = useCallback(
        (tick: number, width: number) => {
            const t = (tick - dispStart) / rangeTicks;
            return t * Math.max(1, width);
        },
        [dispStart, rangeTicks]
    );
    return { view, toTick, toX };
}
