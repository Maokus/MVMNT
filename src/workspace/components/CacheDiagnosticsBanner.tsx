import React, { useMemo } from 'react';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';

export const CacheDiagnosticsBanner: React.FC = () => {
    const bannerVisible = useAudioDiagnosticsStore((state) => state.bannerVisible);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const regenerateAll = useAudioDiagnosticsStore((state) => state.regenerateAll);
    const setPanelOpen = useAudioDiagnosticsStore((state) => state.setPanelOpen);

    const issueSummary = useMemo(() => {
        const totals = diffs.reduce(
            (acc, diff) => {
                acc.missing += diff.missing.length;
                acc.stale += diff.stale.length;
                return acc;
            },
            { missing: 0, stale: 0 },
        );
        const missingCount = totals.missing;
        const staleCount = totals.stale;
        const total = missingCount + staleCount;
        return {
            missingCount,
            staleCount,
            total,
        };
    }, [diffs]);

    if (!bannerVisible || issueSummary.total === 0) {
        return null;
    }

    const copy = issueSummary.total === 1
        ? '1 descriptor requires regeneration to match the requested analysis profile.'
        : `${issueSummary.total} descriptors require regeneration to match the requested analysis profile.`;

    return (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-[12px] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                    <div className="text-[13px] font-semibold text-amber-100">Audio analysis updates recommended</div>
                    <div className="text-amber-50/90">{copy}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-[12px] font-medium text-emerald-100 transition hover:bg-emerald-500/30"
                        onClick={() => regenerateAll()}
                    >
                        Regenerate All
                    </button>
                    <button
                        type="button"
                        className="rounded border border-sky-400/60 bg-sky-500/15 px-3 py-1 text-[12px] font-medium text-sky-100 transition hover:bg-sky-500/25"
                        onClick={() => setPanelOpen(true)}
                    >
                        Open Diagnostics
                    </button>
                    <a
                        className="inline-flex items-center rounded border border-amber-400/40 px-3 py-1 text-[12px] font-medium text-amber-100 transition hover:bg-amber-500/10"
                        href="docs/audio-feature-bindings.md#cache-regeneration"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Learn More
                    </a>
                </div>
            </div>
        </div>
    );
};
