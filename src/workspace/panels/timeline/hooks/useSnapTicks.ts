import { useCallback } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import {
    getAdaptiveSnapSetting,
    quantizeDivisionToTick,
    quantizeSettingToExactTicks,
    type QuantizeSetting,
} from '@state/timeline/quantize';

/**
 * Shared snap-to-tick hook. Respects adaptive snapping when enabled.
 * Use this in all timeline components that need tick snapping.
 */
export function useSnapTicks() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
    const arbitrarySnapN = useTimelineStore((s) => s.transport.arbitrarySnapN);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const viewStart = useTimelineStore((s) => s.timelineView.startTick);
    const viewEnd = useTimelineStore((s) => s.timelineView.endTick);
    const ppq = CANONICAL_PPQ;

    return useCallback(
        (candidateTick: number, altKey?: boolean, forceSnap?: boolean, allowNegative = false) => {
            const clamp = (val: number) => {
                const rounded = Math.round(val);
                return allowNegative ? rounded : Math.max(0, rounded);
            };
            if (altKey) return clamp(candidateTick);
            let target: QuantizeSetting;
            if (forceSnap) {
                target = 'bar';
            } else if (adaptiveSnap && quantize !== 'off') {
                target = getAdaptiveSnapSetting(viewEnd - viewStart, bpb, ppq);
            } else {
                target = quantize;
            }
            if (target === 'off') return clamp(candidateTick);
            const resolution = quantizeSettingToExactTicks(target, bpb, ppq, arbitrarySnapN);
            if (!resolution) return clamp(candidateTick);
            const snapped = quantizeDivisionToTick(
                Math.round(candidateTick / resolution),
                target,
                bpb,
                ppq,
                arbitrarySnapN
            );
            return clamp(snapped ?? candidateTick);
        },
        [quantize, adaptiveSnap, arbitrarySnapN, bpb, ppq, viewStart, viewEnd]
    );
}
