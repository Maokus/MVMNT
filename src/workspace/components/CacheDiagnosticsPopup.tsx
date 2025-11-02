import React, { useCallback } from 'react';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { isFeatureEnabled } from '@utils/featureFlags';

export const CacheDiagnosticsPopup: React.FC = () => {
    const diagnosticsEnabled = isFeatureEnabled('feature.audioVis.cacheDiagnosticsPhase3');
    const visible = useAudioDiagnosticsStore((state) => state.missingPopupVisible);
    const dismissMissingPopup = useAudioDiagnosticsStore((state) => state.dismissMissingPopup);
    const regenerateAll = useAudioDiagnosticsStore((state) => state.regenerateAll);

    const handleDismiss = useCallback(() => {
        dismissMissingPopup();
    }, [dismissMissingPopup]);

    const handleCalculate = useCallback(() => {
        regenerateAll();
        dismissMissingPopup();
    }, [regenerateAll, dismissMissingPopup]);

    if (!diagnosticsEnabled || !visible) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[70] max-w-[320px] sm:max-w-xs md:max-w-sm">
            <div className="pointer-events-auto flex flex-col gap-3 rounded-lg border border-amber-400/40 bg-neutral-950/95 p-4 text-[12px] text-neutral-100 shadow-[0_12px_24px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="text-[13px] font-semibold text-amber-100">Audio analysis required</div>
                <p className="m-0 text-neutral-200">
                    elements exist which require feature tracks that are not yet calculated. Calculate requested feature
                    tracks?
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className="rounded border border-neutral-700 px-3 py-1 text-[12px] font-medium text-neutral-300 transition hover:bg-neutral-800"
                        onClick={handleDismiss}
                    >
                        Dismiss
                    </button>
                    <button
                        type="button"
                        className="rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-[12px] font-medium text-emerald-100 transition hover:bg-emerald-500/30"
                        onClick={handleCalculate}
                    >
                        Calculate
                    </button>
                </div>
            </div>
        </div>
    );
};
