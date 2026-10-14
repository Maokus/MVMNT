import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioFeatureCacheStatus } from '@audio/features/audioFeatureTypes';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { Button } from './Button';
import { PopupCard } from './PopupCard';
import { ProgressBar } from './ProgressBar';

function formatProgressLabel(statuses: AudioFeatureCacheStatus[]): string {
    const activeStatus = statuses.find((status) => status.state === 'pending');
    const label = activeStatus?.progress?.label;
    if (!label || label === 'start') return 'Preparing analysis…';
    if (label === 'complete') return 'Finalising analysis…';
    return label;
}

export const CacheDiagnosticsPopup: React.FC = () => {
    const visible = useAudioDiagnosticsStore((state) => state.missingPopupVisible);
    const dismissMissingPopup = useAudioDiagnosticsStore((state) => state.dismissMissingPopup);
    const regenerateAll = useAudioDiagnosticsStore((state) => state.regenerateAll);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const featureCacheStatus = useTimelineStore((state) => state.audioFeatureCacheStatus);
    const [calculationSourceIds, setCalculationSourceIds] = useState<string[]>([]);
    const hasSeenPendingRef = useRef(false);

    const calculationStatuses = useMemo(
        () =>
            calculationSourceIds
                .map((sourceId) => featureCacheStatus[sourceId])
                .filter((status): status is AudioFeatureCacheStatus => Boolean(status)),
        [calculationSourceIds, featureCacheStatus]
    );
    const isCalculating = calculationSourceIds.length > 0;
    const pendingStatuses = calculationStatuses.filter((status) => status.state === 'pending');
    const progress = pendingStatuses.length
        ? Math.round(
              (pendingStatuses.reduce((total, status) => total + (status.progress?.value ?? 0), 0) /
                  pendingStatuses.length) *
                  100
          )
        : 0;

    useEffect(() => {
        if (!isCalculating) return;
        if (pendingStatuses.length > 0) {
            hasSeenPendingRef.current = true;
            return;
        }
        if (hasSeenPendingRef.current) {
            setCalculationSourceIds([]);
            hasSeenPendingRef.current = false;
        }
    }, [isCalculating, pendingStatuses.length]);

    const handleDismiss = useCallback(() => {
        setCalculationSourceIds([]);
        hasSeenPendingRef.current = false;
        dismissMissingPopup();
    }, [dismissMissingPopup]);

    const handleCalculate = useCallback(() => {
        const sourceIds = Array.from(
            new Set(
                diffs
                    .filter((diff) => diff.missing.length > 0 || diff.stale.length > 0)
                    .map((diff) => diff.audioSourceId)
            )
        );
        hasSeenPendingRef.current = false;
        setCalculationSourceIds(sourceIds);
        regenerateAll();
    }, [diffs, regenerateAll]);

    if (!visible && !isCalculating) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[70] max-w-[320px] sm:max-w-xs md:max-w-sm">
            <div className="pointer-events-auto">
                <PopupCard title={isCalculating ? 'Calculating audio features' : 'Audio analysis required'}>
                    {isCalculating ? (
                        <div className="space-y-1" aria-live="polite">
                            <div className="flex items-center justify-between text-neutral-200">
                                <span>{formatProgressLabel(pendingStatuses)}</span>
                                <span>{progress}%</span>
                            </div>
                            <ProgressBar value={progress} label="Audio feature calculation progress" tone="emerald" />
                        </div>
                    ) : (
                        <p className="m-0 text-neutral-200">
                            elements exist which require feature tracks that are not yet calculated. Calculate requested
                            feature tracks?
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="muted" size="sm" onClick={handleDismiss}>
                            {isCalculating ? 'Hide' : 'Dismiss'}
                        </Button>
                        {!isCalculating && (
                            <Button variant="accent" size="sm" onClick={handleCalculate}>
                                Calculate
                            </Button>
                        )}
                    </div>
                </PopupCard>
            </div>
        </div>
    );
};
