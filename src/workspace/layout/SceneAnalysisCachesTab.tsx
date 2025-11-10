import React, { useCallback, useMemo } from 'react';
import type { AudioTrack } from '@audio/audioTypes';
import type { AudioFeatureCacheStatus, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { formatCacheDiffDescriptor, useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { shallow } from 'zustand/shallow';

interface StatusMeta {
    label: string;
    badgeClass: string;
    description?: string;
}

interface PendingDescriptorSummary {
    id: string;
    label: string;
    profile: string;
    status: 'missing' | 'stale' | 'bad-request';
    owners: string[];
}

function getStatusMeta(status?: AudioFeatureCacheStatus): StatusMeta {
    switch (status?.state) {
        case 'ready':
            return {
                label: 'Analysed',
                badgeClass: 'bg-emerald-500/60 text-emerald-50 border border-emerald-300/40',
                description: status?.message,
            };
        case 'pending':
            return {
                label: 'Analysing…',
                badgeClass: 'bg-amber-500/60 text-amber-50 border border-amber-300/40',
                description: status?.message,
            };
        case 'failed':
            return {
                label: 'Failed',
                badgeClass: 'bg-rose-500/70 text-rose-50 border border-rose-300/40',
                description: status.message,
            };
        case 'stale':
            return {
                label: 'Queued',
                badgeClass: 'bg-sky-500/60 text-sky-50 border border-sky-300/40',
                description: status.message ?? 'Awaiting re-analysis',
            };
        case 'idle':
            return {
                label: 'Not analysed',
                badgeClass: 'bg-slate-600/70 text-slate-100 border border-slate-400/40',
                description: status.message,
            };
        default:
            return {
                label: 'Not analysed',
                badgeClass: 'bg-slate-600/70 text-slate-100 border border-slate-400/40',
                description: status?.message,
            };
    }
}

function formatProgressLabel(status?: AudioFeatureCacheStatus): string {
    if (!status?.progress) {
        return 'Preparing analysis…';
    }
    const label = status.progress.label;
    if (!label) {
        return 'Processing audio features…';
    }
    if (label === 'start') {
        return 'Preparing analysis…';
    }
    if (label === 'complete') {
        return 'Finalising analysis…';
    }
    return label;
}

function formatUpdatedAt(value?: number): string | undefined {
    if (!value) return undefined;
    try {
        return new Date(value).toLocaleTimeString();
    } catch {
        return undefined;
    }
}

function getPendingStatusBadgeClass(status: PendingDescriptorSummary['status']): string {
    switch (status) {
        case 'bad-request':
            return 'border border-rose-400/60 bg-rose-500/10 text-rose-100';
        case 'missing':
            return 'border border-amber-400/60 bg-amber-500/10 text-amber-100';
        case 'stale':
        default:
            return 'border border-sky-400/60 bg-sky-500/10 text-sky-100';
    }
}

function getPendingStatusLabel(status: PendingDescriptorSummary['status']): string {
    switch (status) {
        case 'bad-request':
            return 'Bad request';
        case 'missing':
            return 'Missing';
        case 'stale':
        default:
            return 'Stale';
    }
}

function getFeatureTrackLabel(track: AudioFeatureTrack): string {
    const calculator = track.calculatorId
        ? audioFeatureCalculatorRegistry.get(track.calculatorId)
        : undefined;
    if (calculator?.label) {
        return calculator.label;
    }
    return track.key;
}

const SceneAnalysisCachesTab: React.FC = () => {
    const timelineState = useTimelineStore(
        (state) => ({
            order: state.tracksOrder,
            tracks: state.tracks,
            status: state.audioFeatureCacheStatus,
            caches: state.audioFeatureCaches,
            audioCache: state.audioCache,
        }),
        shallow,
    );
    const stopAnalysis = useTimelineStore((state) => state.stopAudioFeatureAnalysis);
    const restartAnalysis = useTimelineStore((state) => state.restartAudioFeatureAnalysis);
    const reanalyzeFeature = useTimelineStore((state) => state.reanalyzeAudioFeatureCalculators);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const regenerateAll = useAudioDiagnosticsStore((state) => state.regenerateAll);
    const deleteExtraneousCaches = useAudioDiagnosticsStore((state) => state.deleteExtraneousCaches);

    const rows = useMemo(() => {
        return timelineState.order
            .map((trackId) => timelineState.tracks[trackId])
            .filter((track): track is AudioTrack => Boolean(track) && track.type === 'audio')
            .map((track) => {
                const sourceId = track.audioSourceId ?? track.id;
                const status = timelineState.status[sourceId];
                const cache = timelineState.caches[sourceId];
                const hasAudioBuffer = Boolean(timelineState.audioCache[sourceId]?.audioBuffer);
                const features = Object.values(cache?.featureTracks ?? {})
                    .map((feature) => ({
                        key: feature.key,
                        label: getFeatureTrackLabel(feature),
                        calculatorId: feature.calculatorId,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                return {
                    trackId: track.id,
                    trackName: track.name ?? track.id,
                    sourceId,
                    status,
                    hasCache: !!cache,
                    hasAudioBuffer,
                    updatedAt: status?.updatedAt,
                    features,
                };
            });
    }, [timelineState]);

    const diagnosticsBySource = useMemo(() => {
        const map = new Map<string, { pending: PendingDescriptorSummary[]; extraneousCount: number }>();
        for (const diff of diffs) {
            const sourceId = diff.audioSourceId;
            if (!sourceId) {
                continue;
            }
            let entry = map.get(sourceId);
            if (!entry) {
                entry = { pending: [], extraneousCount: 0 };
                map.set(sourceId, entry);
            }
            entry.extraneousCount += diff.extraneous.length;
            const profileLabel = diff.analysisProfileId ?? 'default';
            for (const descriptorId of diff.missing) {
                entry.pending.push({
                    id: descriptorId,
                    label: formatCacheDiffDescriptor(diff, descriptorId),
                    profile: profileLabel,
                    status: 'missing',
                    owners: diff.owners[descriptorId] ?? [],
                });
            }
            for (const descriptorId of diff.stale) {
                entry.pending.push({
                    id: descriptorId,
                    label: formatCacheDiffDescriptor(diff, descriptorId),
                    profile: profileLabel,
                    status: 'stale',
                    owners: diff.owners[descriptorId] ?? [],
                });
            }
            for (const descriptorId of diff.badRequest) {
                entry.pending.push({
                    id: descriptorId,
                    label: formatCacheDiffDescriptor(diff, descriptorId),
                    profile: profileLabel,
                    status: 'bad-request',
                    owners: diff.owners[descriptorId] ?? [],
                });
            }
        }
        for (const entry of map.values()) {
            entry.pending.sort((a, b) => {
                if (a.status !== b.status) {
                    const priority: Record<PendingDescriptorSummary['status'], number> = {
                        'bad-request': 0,
                        missing: 1,
                        stale: 2,
                    };
                    return priority[a.status] - priority[b.status];
                }
                if (a.profile !== b.profile) {
                    return a.profile.localeCompare(b.profile);
                }
                return a.label.localeCompare(b.label);
            });
        }
        return map;
    }, [diffs]);

    const totalPendingDescriptors = useMemo(
        () => diffs.reduce((acc, diff) => acc + diff.missing.length + diff.stale.length, 0),
        [diffs],
    );
    const totalExtraneousDescriptors = useMemo(
        () => diffs.reduce((acc, diff) => acc + diff.extraneous.length, 0),
        [diffs],
    );
    const totalBadRequests = useMemo(
        () => diffs.reduce((acc, diff) => acc + diff.badRequest.length, 0),
        [diffs],
    );

    const deleteExtraneousDisabled = totalExtraneousDescriptors === 0;
    const regenerateAllDisabled = totalPendingDescriptors === 0;

    const pendingSummary = totalPendingDescriptors
        ? `${totalPendingDescriptors} requested feature track${totalPendingDescriptors === 1 ? '' : 's'} awaiting analysis`
        : 'All requested feature tracks are cached.';
    const extraneousSummary = totalExtraneousDescriptors
        ? `${totalExtraneousDescriptors} extraneous cache entr${totalExtraneousDescriptors === 1 ? 'y' : 'ies'}`
        : null;
    const badRequestSummary = totalBadRequests
        ? `${totalBadRequests} invalid descriptor${totalBadRequests === 1 ? '' : 's'}`
        : null;

    const handleStop = useCallback(
        (sourceId: string) => {
            stopAnalysis(sourceId);
        },
        [stopAnalysis],
    );

    const handleRestart = useCallback(
        (sourceId: string) => {
            restartAnalysis(sourceId);
        },
        [restartAnalysis],
    );

    const handleReanalyzeFeature = useCallback(
        (sourceId: string, calculatorId: string) => {
            if (!calculatorId) {
                return;
            }
            reanalyzeFeature(sourceId, [calculatorId]);
        },
        [reanalyzeFeature],
    );

    return (
        <div className="flex flex-col gap-3">
            <h3 className="m-0 text-[13px] font-semibold text-white">Analysis Caches</h3>
            <p className="m-0 text-[12px] text-neutral-400">
                Monitor audio feature processing progress and manually control analysis jobs.
            </p>
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3 text-[11px] text-neutral-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-neutral-400">
                        {pendingSummary}
                        {extraneousSummary && (
                            <>
                                {' '}
                                · <span className="text-neutral-500">{extraneousSummary}</span>
                            </>
                        )}
                        {badRequestSummary && (
                            <>
                                {' '}
                                · <span className="text-rose-400">{badRequestSummary}</span>
                            </>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${deleteExtraneousDisabled
                                ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                : 'border-rose-500/60 text-rose-200 hover:bg-rose-500/10'
                                }`}
                            onClick={deleteExtraneousCaches}
                            disabled={deleteExtraneousDisabled}
                        >
                            Delete extraneous caches
                        </button>
                        <button
                            type="button"
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${regenerateAllDisabled
                                ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                : 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10'
                                }`}
                            onClick={regenerateAll}
                            disabled={regenerateAllDisabled}
                        >
                            Calculate requested feature tracks
                        </button>
                    </div>
                </div>
            </div>
            {rows.length === 0 ? (
                <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-4 text-[12px] text-neutral-400">
                    Add an audio track to begin analysing audio features.
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {rows.map((row) => {
                        const rowDiagnostics = diagnosticsBySource.get(row.sourceId);
                        const pendingDescriptors = rowDiagnostics?.pending ?? [];
                        const extraneousCount = rowDiagnostics?.extraneousCount ?? 0;
                        const statusMeta = getStatusMeta(row.status);
                        const percent = row.status?.state === 'pending' && row.status.progress
                            ? Math.round(Math.max(0, Math.min(1, row.status.progress.value)) * 100)
                            : 0;
                        const updatedLabel = formatUpdatedAt(row.updatedAt);
                        const stopDisabled = row.status?.state !== 'pending';
                        const restartDisabled = !row.hasAudioBuffer;
                        const restartTitle = restartDisabled
                            ? 'Audio buffer unavailable for this track.'
                            : 'Restart analysis';
                        return (
                            <div
                                key={row.sourceId}
                                className="rounded border border-neutral-800 bg-neutral-900/60 p-3 text-[12px] text-neutral-300"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium text-white">{row.trackName}</div>
                                        <div className="text-[11px] text-neutral-500">
                                            Source ID: <span className="text-neutral-300">{row.sourceId}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                        <span
                                            className={`rounded px-2 py-[2px] text-[11px] font-medium ${statusMeta.badgeClass}`}
                                        >
                                            {statusMeta.label}
                                        </span>
                                        {statusMeta.description && (
                                            <span className="text-neutral-400">{statusMeta.description}</span>
                                        )}
                                        {updatedLabel && (
                                            <span className="text-neutral-500">Updated {updatedLabel}</span>
                                        )}
                                    </div>
                                </div>
                                {row.status?.state === 'pending' && (
                                    <div className="mt-3 space-y-1">
                                        <div className="flex items-center justify-between text-[11px] text-neutral-400">
                                            <span>{formatProgressLabel(row.status)}</span>
                                            <span>{percent}%</span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
                                            <div
                                                className="h-full rounded bg-amber-400"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="mt-3 flex flex-col gap-2 text-[11px]">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-neutral-400">
                                            {row.hasCache
                                                ? row.features.length
                                                    ? `Cached ${row.features.length} feature ${row.features.length === 1 ? 'track' : 'tracks'
                                                    }.`
                                                    : 'Cached feature metadata available.'
                                                : 'No analysed feature data stored yet.'}
                                            {extraneousCount > 0 && (
                                                <span className="text-neutral-500">
                                                    {' '}
                                                    · {extraneousCount} extraneous entr
                                                    {extraneousCount === 1 ? 'y' : 'ies'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={`rounded border px-2 py-1 transition-colors ${stopDisabled
                                                    ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                                    : 'border-rose-500/60 text-rose-200 hover:bg-rose-500/10'
                                                    }`}
                                                onClick={() => handleStop(row.sourceId)}
                                                disabled={stopDisabled}
                                            >
                                                Stop
                                            </button>
                                            <button
                                                type="button"
                                                className={`rounded border px-2 py-1 transition-colors ${restartDisabled
                                                    ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                                    : 'border-sky-500/60 text-sky-200 hover:bg-sky-500/10'
                                                    }`}
                                                onClick={() => handleRestart(row.sourceId)}
                                                disabled={restartDisabled}
                                                title={restartTitle}
                                            >
                                                Recalculate all
                                            </button>
                                        </div>
                                    </div>
                                    {pendingDescriptors.length > 0 && (
                                        <div className="rounded border border-amber-500/40 bg-neutral-900/70 p-2">
                                            <div className="mb-1 text-[11px] font-semibold text-amber-100">
                                                Requested feature tracks awaiting analysis
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {pendingDescriptors.map((pending) => (
                                                    <div
                                                        key={`${row.sourceId}-${pending.id}-${pending.status}-${pending.profile}`}
                                                        className="flex flex-col gap-1 rounded border border-neutral-800/70 bg-neutral-950/60 p-2"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="text-[11px] font-medium text-neutral-100">
                                                                {pending.label}
                                                            </span>
                                                            <span
                                                                className={`rounded px-2 py-[1px] text-[10px] font-medium ${getPendingStatusBadgeClass(pending.status)}`}
                                                            >
                                                                {getPendingStatusLabel(pending.status)}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] text-neutral-500">
                                                            Profile: <span className="text-neutral-300">{pending.profile}</span>
                                                            {pending.owners.length > 0 && (
                                                                <>
                                                                    {' '}
                                                                    · Owners:{' '}
                                                                    <span className="text-neutral-300">
                                                                        {pending.owners.join(', ')}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {row.features.length > 0 && (
                                        <div className="rounded border border-neutral-800 bg-neutral-950/50 p-2">
                                            <div className="mb-1 text-[11px] font-semibold text-neutral-200">
                                                Cached feature tracks
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {row.features.map((feature) => {
                                                    const reanalyzeDisabled =
                                                        row.status?.state === 'pending'
                                                        || !row.hasAudioBuffer
                                                        || !feature.calculatorId;
                                                    const reanalyzeTitle = !row.hasAudioBuffer
                                                        ? 'Audio buffer unavailable for this track.'
                                                        : row.status?.state === 'pending'
                                                            ? 'Analysis already in progress.'
                                                            : feature.calculatorId
                                                                ? 'Re-analyse this feature track.'
                                                                : 'Calculator metadata unavailable.';
                                                    return (
                                                        <div
                                                            key={`${row.sourceId}-${feature.key}`}
                                                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-800/60 bg-neutral-900/60 px-2 py-1"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] font-medium text-neutral-100">
                                                                    {feature.label}
                                                                </span>
                                                                <span className="text-[10px] text-neutral-500">
                                                                    Key: <span className="text-neutral-300">{feature.key}</span>
                                                                    {feature.calculatorId && (
                                                                        <>
                                                                            {' '}
                                                                            · Calculator:{' '}
                                                                            <span className="text-neutral-300">
                                                                                {feature.calculatorId}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className={`rounded border px-2 py-1 transition-colors ${reanalyzeDisabled
                                                                    ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                                                    : 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10'
                                                                    }`}
                                                                onClick={() =>
                                                                    feature.calculatorId
                                                                    && handleReanalyzeFeature(row.sourceId, feature.calculatorId)
                                                                }
                                                                disabled={reanalyzeDisabled}
                                                                title={reanalyzeTitle}
                                                            >
                                                                Re-analyse
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SceneAnalysisCachesTab;
