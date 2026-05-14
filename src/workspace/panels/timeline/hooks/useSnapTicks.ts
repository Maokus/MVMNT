import { useCallback } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { getAdaptiveSnapSetting, quantizeSettingToBeats, type QuantizeSetting } from '@state/timeline/quantize';

/**
 * Shared snap-to-tick hook. Respects adaptive snapping when enabled.
 * Use this in all timeline components that need tick snapping.
 */
export function useSnapTicks() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
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
            const beatLength = quantizeSettingToBeats(target, bpb);
            if (!beatLength) return clamp(candidateTick);
            const resolution = Math.max(1, Math.round(beatLength * ppq));
            return clamp(Math.round(candidateTick / resolution) * resolution);
        },
        [quantize, adaptiveSnap, bpb, ppq, viewStart, viewEnd]
    );
}
