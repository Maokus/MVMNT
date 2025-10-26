import React from 'react';
import type { AudioFeatureCache, AudioFeatureCacheStatus, AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import {
    formatCacheDiffDescriptor,
    useAudioDiagnosticsStore,
    type CacheDiff,
} from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { CollapsibleCard, Section } from './Section';

type DescriptorRecord = {
    descriptor: AudioFeatureDescriptor;
};

type FeatureRequestRecord = {
    elementId: string;
    elementType: string;
    trackRef: string;
    analysisProfileId: string | null;
    descriptors: Record<string, DescriptorRecord>;
    requirementDiagnostics: Array<{ descriptor: AudioFeatureDescriptor; satisfied: boolean }>;
    unexpectedDescriptors: string[];
    autoManaged: boolean;
};

type CacheEntry = {
    key: string;
    cache?: AudioFeatureCache;
    status?: AudioFeatureCacheStatus;
};

const formatDescriptorDetails = (descriptor: AudioFeatureDescriptor | undefined): string => {
    if (!descriptor) {
        return 'unknown descriptor';
    }
    const parts: string[] = [];
    parts.push(descriptor.featureKey ?? 'unknown');
    if (descriptor.calculatorId) {
        parts.push(`calc:${descriptor.calculatorId}`);
    }
    if (descriptor.bandIndex != null) {
        parts.push(`band:${descriptor.bandIndex}`);
    }
    return parts.join(' · ');
};

const collectCacheFeatureLabels = (cache: AudioFeatureCache | undefined): string[] => {
    if (!cache) {
        return [];
    }
    const labels: string[] = [];
    for (const track of Object.values(cache.featureTracks ?? {})) {
        if (!track) {
            continue;
        }
        const parts: string[] = [track.key];
        if (track.calculatorId) {
            parts.push(`calc:${track.calculatorId}`);
        }
        if (track.analysisProfileId) {
            parts.push(`profile:${track.analysisProfileId}`);
        }
        parts.push(`${track.channels}ch`);
        parts.push(`${track.frameCount} frames`);
        labels.push(parts.join(' · '));
    }
    return labels;
};

const formatCacheStatusSummary = (status: AudioFeatureCacheStatus | undefined): string => {
    if (!status) {
        return 'no status';
    }
    const parts: string[] = [status.state];
    if (status.progress) {
        const pct = Math.round((status.progress.value ?? 0) * 100);
        const label = status.progress.label ? ` ${status.progress.label}` : '';
        parts.push(`progress ${pct}%${label}`.trim());
    }
    if (status.message) {
        parts.push(status.message);
    }
    return parts.join(' · ');
};

const formatDescriptorMeta = (descriptor: AudioFeatureDescriptor | undefined): string | null => {
    if (!descriptor) return null;
    const parts: string[] = [];
    if (descriptor.featureKey) {
        parts.push(`feature:${descriptor.featureKey}`);
    }
    if (descriptor.calculatorId) {
        parts.push(`calc:${descriptor.calculatorId}`);
    }
    if (descriptor.bandIndex != null) {
        parts.push(`band:${descriptor.bandIndex}`);
    }
    return parts.length ? parts.join(' · ') : null;
};

const formatOwners = (owners: string[] | undefined): string => {
    if (!owners || owners.length === 0) {
        return 'none';
    }
    return owners.join(', ');
};

const formatRelativeTime = (timestamp: number | undefined): string => {
    if (!timestamp) return '—';
    const delta = Date.now() - timestamp;
    if (!Number.isFinite(delta) || delta < 0) return 'just now';
    if (delta < 1000) return `${Math.max(0, Math.round(delta))}ms ago`;
    if (delta < 60_000) return `${(delta / 1000).toFixed(1)}s ago`;
    const minutes = delta / 60000;
    if (minutes < 60) return `${minutes.toFixed(1)}m ago`;
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h ago`;
};

type DiagnosticsListProps = {
    diff: CacheDiff;
    descriptorIds: string[];
    title: string;
    color: string;
    highlightOwners: boolean;
    hint?: string;
};

const DiagnosticsList: React.FC<DiagnosticsListProps> = ({
    diff,
    descriptorIds,
    title,
    color,
    highlightOwners,
    hint,
}) => {
    if (!descriptorIds.length) {
        return null;
    }
    return (
        <div>
            <div
                style={{
                    color,
                    fontWeight: 600,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                }}
            >
                {title}
                {hint ? (
                    <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6 }}>
                        ({hint})
                    </span>
                ) : null}
            </div>
            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                {descriptorIds.map((id) => {
                    const descriptor = diff.descriptorDetails[id];
                    const owners = diff.owners[id];
                    const meta = formatDescriptorMeta(descriptor);
                    const ownersLabel = formatOwners(owners);
                    const ownerPrefix = highlightOwners ? 'Waiting elements' : 'Owners';
                    const ownerSuffix = !highlightOwners && (!owners || owners.length === 0) ? ' (cached only)' : '';
                    return (
                        <li key={`${diff.trackRef}-${diff.analysisProfileId ?? 'default'}-${title}-${id}`}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {formatCacheDiffDescriptor(diff, id)}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                                Descriptor ID:{' '}
                                <code style={{ fontSize: 11 }}>{id}</code>
                            </div>
                            {meta ? (
                                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                                    {meta}
                                </div>
                            ) : null}
                            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                                {ownerPrefix}: {ownersLabel}
                                {ownerSuffix}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

type AudioDiagnosticsSectionProps = {
    open: boolean;
    onToggle: () => void;
};

export const AudioDiagnosticsSection: React.FC<AudioDiagnosticsSectionProps> = ({ open, onToggle }) => {
    const intentsByElement = useAudioDiagnosticsStore((state) => state.intentsByElement);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const audioFeatureCaches = useTimelineStore((state) => state.audioFeatureCaches);
    const audioFeatureCacheStatus = useTimelineStore((state) => state.audioFeatureCacheStatus);

    const [audioSubSectionsOpen, setAudioSubSectionsOpen] = React.useState({
        requests: true,
        caches: true,
        diagnostics: false,
    });
    const [expandedRequests, setExpandedRequests] = React.useState<Record<string, boolean>>({});
    const [expandedCaches, setExpandedCaches] = React.useState<Record<string, boolean>>({});
    const [expandedDiagnostics, setExpandedDiagnostics] = React.useState<Record<string, boolean>>({});

    const featureRequests = React.useMemo(() => {
        const entries = Object.values(intentsByElement ?? {}) as FeatureRequestRecord[];
        return entries.sort((a, b) => {
            if (a.trackRef !== b.trackRef) {
                return a.trackRef.localeCompare(b.trackRef);
            }
            return a.elementId.localeCompare(b.elementId);
        });
    }, [intentsByElement]);

    const cacheEntries = React.useMemo<CacheEntry[]>(() => {
        const keys = new Set([
            ...Object.keys(audioFeatureCaches ?? {}),
            ...Object.keys(audioFeatureCacheStatus ?? {}),
        ]);
        return Array.from(keys)
            .map((key) => ({
                key,
                cache: audioFeatureCaches?.[key],
                status: audioFeatureCacheStatus?.[key],
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
    }, [audioFeatureCaches, audioFeatureCacheStatus]);

    const diffSummaries = React.useMemo(() => {
        return [...(diffs ?? [])].sort((a, b) => {
            if (a.trackRef !== b.trackRef) {
                return a.trackRef.localeCompare(b.trackRef);
            }
            const profileA = a.analysisProfileId ?? '';
            const profileB = b.analysisProfileId ?? '';
            return profileA.localeCompare(profileB);
        });
    }, [diffs]);

    const toggleAudioSubSection = (key: keyof typeof audioSubSectionsOpen) => {
        setAudioSubSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleExpanded = (
        updater: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
        key: string,
    ) => {
        updater((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <Section
            title="Audio Features"
            open={open}
            onToggle={onToggle}
            subtitle={`${featureRequests.length} req · ${cacheEntries.length} caches`}
        >
            <div style={{ display: 'grid', gap: 12 }}>
                <CollapsibleCard
                    title="Scene Requests"
                    open={audioSubSectionsOpen.requests}
                    onToggle={() => toggleAudioSubSection('requests')}
                    subtitle={`${featureRequests.length} active`}
                >
                    {featureRequests.length ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                            {featureRequests.map((record) => {
                                const descriptorEntries = Object.values(record.descriptors ?? {});
                                const descriptors = descriptorEntries
                                    .map((entry) => formatDescriptorDetails(entry.descriptor))
                                    .sort();
                                const missingRequirements = record.requirementDiagnostics
                                    .filter((diag) => !diag.satisfied)
                                    .map((diag) => formatDescriptorDetails(diag.descriptor));
                                const unexpected = record.unexpectedDescriptors.length;
                                const key = record.elementId;
                                const expanded = !!expandedRequests[key];
                                const hasIssues = missingRequirements.length > 0 || unexpected > 0;
                                return (
                                    <li
                                        key={key}
                                        style={{
                                            border: '1px solid rgba(148, 163, 184, 0.25)',
                                            borderRadius: 6,
                                            background: 'rgba(15, 23, 42, 0.35)',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(setExpandedRequests, key)}
                                            aria-expanded={expanded}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#e2e8f0',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    <span>{record.elementId}</span>
                                                    <span style={{ opacity: 0.65, fontWeight: 400 }}>
                                                        ({record.elementType})
                                                    </span>
                                                    <span style={{ opacity: 0.5 }}>
                                                        · {record.trackRef}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                                                    {descriptors.length} descriptor{descriptors.length === 1 ? '' : 's'}
                                                    {record.analysisProfileId ? ` · profile:${record.analysisProfileId}` : ''}
                                                    {record.autoManaged ? ' · auto-managed' : ''}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {hasIssues ? (
                                                    <span style={{ color: '#f97316', fontWeight: 600 }}>
                                                        Issues
                                                    </span>
                                                ) : (
                                                    <span style={{ opacity: 0.6 }}>OK</span>
                                                )}
                                                <span>{expanded ? '▾' : '▸'}</span>
                                            </span>
                                        </button>
                                        {expanded ? (
                                            <div style={{ padding: '0 12px 12px 12px', fontSize: 11, display: 'grid', gap: 8 }}>
                                                <div>
                                                    <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, marginBottom: 4 }}>
                                                        Requested descriptors
                                                    </div>
                                                    <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                        {descriptors.map((label, index) => (
                                                            <li key={`${key}-descriptor-${index}`}>{label}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                {missingRequirements.length ? (
                                                    <div>
                                                        <div style={{ color: '#f97316', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                            Unsatisfied requirements
                                                        </div>
                                                        <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                            {missingRequirements.map((label, index) => (
                                                                <li key={`${key}-missing-${index}`}>{label}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : null}
                                                {unexpected ? (
                                                    <div style={{ color: '#f87171' }}>
                                                        Unexpected descriptors detected: {unexpected}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div style={{ opacity: 0.65, fontSize: 11 }}>No active scene requests.</div>
                    )}
                </CollapsibleCard>

                <CollapsibleCard
                    title="Feature Cache State"
                    open={audioSubSectionsOpen.caches}
                    onToggle={() => toggleAudioSubSection('caches')}
                    subtitle={`${cacheEntries.length} cached`}
                >
                    {cacheEntries.length ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                            {cacheEntries.map((entry) => {
                                const labels = collectCacheFeatureLabels(entry.cache);
                                const key = entry.key;
                                const expanded = !!expandedCaches[key];
                                const statusLabel = formatCacheStatusSummary(entry.status);
                                const cacheUpdatedAt = (entry.cache as { updatedAt?: number } | undefined)?.updatedAt;
                                const updatedAgo =
                                    typeof cacheUpdatedAt === 'number' ? formatRelativeTime(cacheUpdatedAt) : null;
                                return (
                                    <li
                                        key={key}
                                        style={{
                                            border: '1px solid rgba(148, 163, 184, 0.25)',
                                            borderRadius: 6,
                                            background: 'rgba(15, 23, 42, 0.35)',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(setExpandedCaches, key)}
                                            aria-expanded={expanded}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#e2e8f0',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600 }}>{entry.key}</div>
                                                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                                                    {statusLabel}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {updatedAgo ? <span style={{ opacity: 0.6 }}>{updatedAgo}</span> : null}
                                                <span>{expanded ? '▾' : '▸'}</span>
                                            </span>
                                        </button>
                                        {expanded ? (
                                            <div style={{ padding: '0 12px 12px 12px', fontSize: 11, display: 'grid', gap: 8 }}>
                                                <div style={{ opacity: 0.7 }}>
                                                    Source: {entry.cache?.audioSourceId ?? '—'}
                                                    {entry.cache ? ` · ${entry.cache.frameCount} frames` : ''}
                                                </div>
                                                {labels.length ? (
                                                    <div>
                                                        <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, marginBottom: 4 }}>
                                                            Cached Feature Tracks
                                                        </div>
                                                        <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                            {labels.map((label, index) => (
                                                                <li key={`${key}-feature-${index}`}>{label}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : (
                                                    <div style={{ opacity: 0.6 }}>No cached feature tracks.</div>
                                                )}
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div style={{ opacity: 0.65, fontSize: 11 }}>No audio feature caches available.</div>
                    )}
                </CollapsibleCard>

                {diffSummaries.length ? (
                    <CollapsibleCard
                        title="Cache Diagnostics"
                        open={audioSubSectionsOpen.diagnostics}
                        onToggle={() => toggleAudioSubSection('diagnostics')}
                        subtitle={`${diffSummaries.length} tracked`}
                    >
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                            {diffSummaries.map((diff) => {
                                const key = `${diff.trackRef}__${diff.analysisProfileId ?? 'default'}`;
                                const expanded = !!expandedDiagnostics[key];
                                const issueCount =
                                    diff.missing.length +
                                    diff.stale.length +
                                    diff.extraneous.length +
                                    diff.regenerating.length;
                                return (
                                    <li
                                        key={key}
                                        style={{
                                            border: '1px solid rgba(148, 163, 184, 0.25)',
                                            borderRadius: 6,
                                            background: 'rgba(15, 23, 42, 0.35)',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(setExpandedDiagnostics, key)}
                                            aria-expanded={expanded}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#e2e8f0',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600 }}>
                                                    {diff.trackRef}
                                                    <span style={{ opacity: 0.65, fontWeight: 400 }}>
                                                        {' '}
                                                        ({diff.analysisProfileId ?? 'default'})
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 11, marginTop: 2 }}>
                                                    <span
                                                        style={{
                                                            color: diff.status === 'issues' ? '#f87171' : '#34d399',
                                                            fontWeight: 600,
                                                            marginRight: 6,
                                                        }}
                                                    >
                                                        {diff.status}
                                                    </span>
                                                    <span style={{ opacity: 0.7 }}>
                                                        · {diff.descriptorsRequested.length} requested · {diff.descriptorsCached.length} cached
                                                    </span>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {issueCount ? (
                                                    <span style={{ color: '#f97316', fontWeight: 600 }}>{issueCount}</span>
                                                ) : (
                                                    <span style={{ opacity: 0.6 }}>0</span>
                                                )}
                                                <span>{expanded ? '▾' : '▸'}</span>
                                            </span>
                                        </button>
                                        {expanded ? (
                                            <div style={{ padding: '0 12px 12px 12px', fontSize: 11, display: 'grid', gap: 10 }}>
                                                <div style={{ opacity: 0.75 }}>
                                                    Audio source: <strong>{diff.audioSourceId}</strong> · Updated {formatRelativeTime(diff.updatedAt)}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, opacity: 0.75 }}>
                                                    <span>Missing: {diff.missing.length}</span>
                                                    <span>Stale: {diff.stale.length}</span>
                                                    <span>Extraneous: {diff.extraneous.length}</span>
                                                    <span>Regenerating: {diff.regenerating.length}</span>
                                                </div>
                                                <DiagnosticsList
                                                    diff={diff}
                                                    descriptorIds={diff.missing}
                                                    title="Missing"
                                                    color="#f97316"
                                                    highlightOwners
                                                    hint="requested but absent from cache"
                                                />
                                                <DiagnosticsList
                                                    diff={diff}
                                                    descriptorIds={diff.extraneous}
                                                    title="Extraneous"
                                                    color="#f87171"
                                                    highlightOwners={false}
                                                    hint="cached without active owners"
                                                />
                                                <DiagnosticsList
                                                    diff={diff}
                                                    descriptorIds={diff.stale}
                                                    title="Stale"
                                                    color="#eab308"
                                                    highlightOwners={false}
                                                />
                                                <DiagnosticsList
                                                    diff={diff}
                                                    descriptorIds={diff.regenerating}
                                                    title="Regenerating"
                                                    color="#38bdf8"
                                                    highlightOwners={false}
                                                />
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </CollapsibleCard>
                ) : (
                    <div style={{ opacity: 0.65, fontSize: 11 }}>No diagnostics diff information available.</div>
                )}
            </div>
        </Section>
    );
};
