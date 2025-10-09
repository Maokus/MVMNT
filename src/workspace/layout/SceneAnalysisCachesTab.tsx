import React, { useCallback, useMemo } from 'react';
import type { AudioTrack } from '@audio/audioTypes';
import type { AudioFeatureCacheStatus, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { useTimelineStore } from '@state/timelineStore';
import { shallow } from 'zustand/shallow';

interface StatusMeta {
    label: string;
    badgeClass: string;
    description?: string;
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
            {rows.length === 0 ? (
                <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-4 text-[12px] text-neutral-400">
                    Add an audio track to begin analysing audio features.
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {rows.map((row) => {
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
                                                    ? `Cached ${row.features.length} feature ${
                                                          row.features.length === 1 ? 'track' : 'tracks'
                                                      }.`
                                                    : 'Cached feature metadata available.'
                                                : 'No analysed feature data stored yet.'}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={`rounded border px-2 py-1 transition-colors ${
                                                    stopDisabled
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
                                                className={`rounded border px-2 py-1 transition-colors ${
                                                    restartDisabled
                                                        ? 'cursor-not-allowed border-neutral-800 text-neutral-600'
                                                        : 'border-sky-500/60 text-sky-200 hover:bg-sky-500/10'
                                                }`}
                                                onClick={() => handleRestart(row.sourceId)}
                                                disabled={restartDisabled}
                                                title={restartTitle}
                                            >
                                                Restart
                                            </button>
                                        </div>
                                    </div>
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
                                                                className={`rounded border px-2 py-1 transition-colors ${
                                                                    reanalyzeDisabled
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
