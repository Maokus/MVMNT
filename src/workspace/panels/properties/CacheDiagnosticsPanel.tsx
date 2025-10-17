import React, { useMemo } from 'react';
import {
    formatCacheDiffDescriptor,
    useAudioDiagnosticsStore,
    type CacheDiff,
    type RegenerationJob,
} from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { isFeatureEnabled } from '@utils/featureFlags';

interface DescriptorRow {
    id: string;
    status: 'current' | 'missing' | 'stale' | 'extraneous' | 'regenerating';
    label: string;
    owners: string[];
}

function buildDescriptorRows(diff: CacheDiff): DescriptorRow[] {
    const requestedSet = new Set(diff.descriptorsRequested);
    const missingSet = new Set(diff.missing);
    const staleSet = new Set(diff.stale);
    const regeneratingSet = new Set(diff.regenerating);
    const extraneousSet = new Set(diff.extraneous);
    const rows: DescriptorRow[] = [];
    for (const descriptorId of diff.descriptorsRequested) {
        let status: DescriptorRow['status'] = 'current';
        if (regeneratingSet.has(descriptorId)) {
            status = 'regenerating';
        } else if (missingSet.has(descriptorId)) {
            status = 'missing';
        } else if (staleSet.has(descriptorId)) {
            status = 'stale';
        }
        rows.push({
            id: descriptorId,
            status,
            label: formatCacheDiffDescriptor(diff, descriptorId),
            owners: diff.owners[descriptorId] ?? [],
        });
    }
    for (const descriptorId of diff.descriptorsCached) {
        if (requestedSet.has(descriptorId)) continue;
        if (!extraneousSet.has(descriptorId)) continue;
        rows.push({
            id: descriptorId,
            status: 'extraneous',
            label: formatCacheDiffDescriptor(diff, descriptorId),
            owners: diff.owners[descriptorId] ?? [],
        });
    }
    return rows;
}

function describeStatus(status: DescriptorRow['status']): string {
    switch (status) {
        case 'missing':
            return 'Missing from cache';
        case 'stale':
            return 'Stale analysis';
        case 'regenerating':
            return 'Regenerating';
        case 'extraneous':
            return 'Extraneous entry';
        default:
            return 'Current';
    }
}

function getStatusBadgeClass(status: DescriptorRow['status']): string {
    switch (status) {
        case 'missing':
            return 'bg-amber-500/20 border-amber-400/40 text-amber-100';
        case 'stale':
            return 'bg-sky-500/20 border-sky-400/40 text-sky-100';
        case 'regenerating':
            return 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100';
        case 'extraneous':
            return 'bg-neutral-800/70 border-neutral-700 text-neutral-300';
        default:
            return 'bg-neutral-800/70 border-neutral-700 text-neutral-200';
    }
}

function findJobForDiff(jobs: RegenerationJob[], diff: CacheDiff): RegenerationJob | undefined {
    return jobs.find(
        (job) =>
            job.trackRef === diff.trackRef
            && job.analysisProfileId === diff.analysisProfileId
            && (job.status === 'queued' || job.status === 'running'),
    );
}

export const CacheDiagnosticsPanel: React.FC = () => {
    const panelOpen = useAudioDiagnosticsStore((state) => state.panelOpen);
    const setPanelOpen = useAudioDiagnosticsStore((state) => state.setPanelOpen);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const preferences = useAudioDiagnosticsStore((state) => state.preferences);
    const setPreferences = useAudioDiagnosticsStore((state) => state.setPreferences);
    const regenerateDescriptors = useAudioDiagnosticsStore((state) => state.regenerateDescriptors);
    const dismissExtraneous = useAudioDiagnosticsStore((state) => state.dismissExtraneous);
    const jobs = useAudioDiagnosticsStore((state) => state.jobs);
    const cacheStatus = useTimelineStore((state) => state.audioFeatureCacheStatus);
    const tracks = useTimelineStore((state) => state.tracks);

    const visibleDiffs = useMemo(() => {
        const filtered = preferences.showOnlyIssues ? diffs.filter((diff) => diff.status === 'issues') : diffs;
        if (preferences.sort === 'track') {
            return [...filtered].sort((a, b) => a.trackRef.localeCompare(b.trackRef));
        }
        return filtered;
    }, [diffs, preferences]);

    if (!isFeatureEnabled('feature.audioVis.cacheDiagnosticsPhase3')) {
        return null;
    }

    const totalIssues = diffs.reduce((acc, diff) => acc + diff.missing.length + diff.stale.length, 0);
    const trackName = (trackId: string): string => {
        const entry = tracks[trackId] as { name?: string } | undefined;
        return entry?.name ?? trackId;
    };

    return (
        <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/60">
            <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                className="flex w-full items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2 text-left text-[12px] font-medium text-neutral-200"
            >
                <span className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-[10px]">
                        {panelOpen ? '-' : '+'}
                    </span>
                    Cache diagnostics
                </span>
                <span className="text-[11px] text-neutral-400">
                    {totalIssues > 0 ? `${totalIssues} issues` : 'All descriptors current'}
                </span>
            </button>
            {panelOpen && (
                <div className="space-y-3 px-4 py-3 text-[12px] text-neutral-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-[11px] text-neutral-400">
                            <input
                                type="checkbox"
                                checked={preferences.showOnlyIssues}
                                onChange={(event) => setPreferences({ showOnlyIssues: event.target.checked })}
                                className="h-3 w-3 rounded border-neutral-600 bg-neutral-900 text-emerald-500"
                            />
                            Show issues only
                        </label>
                        <span className="text-[11px] text-neutral-500">
                            Updated at {new Date().toLocaleTimeString()}
                        </span>
                    </div>
                    {visibleDiffs.length === 0 ? (
                        <div className="rounded border border-neutral-800 bg-neutral-900/80 px-3 py-4 text-[11px] text-neutral-400">
                            All descriptors are current.
                        </div>
                    ) : (
                        visibleDiffs.map((diff) => {
                            const rows = buildDescriptorRows(diff);
                            const status = cacheStatus[diff.audioSourceId];
                            const updatedAt = status?.updatedAt;
                            const job = findJobForDiff(jobs, diff);
                            return (
                                <div key={`${diff.trackRef}-${diff.analysisProfileId ?? 'default'}`} className="rounded border border-neutral-800 bg-neutral-950/50">
                                    <div className="flex flex-col gap-1 border-b border-neutral-800 px-3 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[12px] font-semibold text-neutral-100">{trackName(diff.trackRef)}</div>
                                                <div className="text-[11px] text-neutral-500">
                                                    Profile: {diff.analysisProfileId ?? 'default'} · Source {diff.audioSourceId}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                                                <span>Missing {diff.missing.length}</span>
                                                <span>Stale {diff.stale.length}</span>
                                                <span>Extraneous {diff.extraneous.length}</span>
                                            </div>
                                        </div>
                                        {updatedAt ? (
                                            <div className="text-[10px] text-neutral-500">
                                                Last analysed {new Date(updatedAt).toLocaleTimeString()}
                                            </div>
                                        ) : null}
                                        {job ? (
                                            <div className="text-[11px] text-sky-300">
                                                Regeneration {job.status === 'running' ? 'in progress' : 'queued'}…
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="divide-y divide-neutral-900/80">
                                        {rows.map((row) => {
                                            const disabled = row.status === 'regenerating';
                                            return (
                                                <div
                                                    key={`${diff.trackRef}-${row.id}`}
                                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-[12px] font-medium text-neutral-100">{row.label}</div>
                                                        <div className="text-[11px] text-neutral-500">
                                                            {describeStatus(row.status)}
                                                            {row.owners.length > 0 && (
                                                                <span className="ml-1 text-neutral-600">
                                                                    · Requested by {row.owners.join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`inline-flex items-center rounded border px-2 py-[1px] text-[10px] font-semibold ${getStatusBadgeClass(row.status)}`}
                                                        >
                                                            {row.status}
                                                        </span>
                                                        {row.status === 'extraneous' ? (
                                                            <button
                                                                type="button"
                                                                className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 transition hover:bg-neutral-800"
                                                                onClick={() => dismissExtraneous(diff.trackRef, diff.analysisProfileId ?? null, row.id)}
                                                            >
                                                                Dismiss
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className={`rounded border px-2 py-1 text-[11px] transition ${disabled
                                                                    ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                                                    : 'border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/20'
                                                                }`}
                                                                onClick={() => regenerateDescriptors(diff.trackRef, diff.analysisProfileId ?? null, [row.id], 'manual')}
                                                                disabled={disabled}
                                                            >
                                                                {disabled ? 'Queued' : 'Regenerate'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
