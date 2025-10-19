import React from 'react';
import type { AudioFeatureCache, AudioFeatureCacheStatus, AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { getTransportCoordinator } from '@audio/transport-coordinator';
import { registerSceneCommandListener } from '@state/scene';
import {
    formatCacheDiffDescriptor,
    useAudioDiagnosticsStore,
} from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';
import { registerTimelineCommandListener } from '@state/timeline/timelineTelemetry';
import type { DebugSettings } from '@context/visualizer/types';

interface RecentCommand {
    id: number;
    label: string;
    source: string;
    durationMs: number;
    success: boolean;
    details?: string;
}

interface TelemetryMetrics {
    totalCommands: number;
    totalDurationMs: number;
    errorCount: number;
    lastEvent?: RecentCommand;
    recent: RecentCommand[];
}

const MAX_RECENT_COMMANDS = 5;

const initialMetrics: TelemetryMetrics = {
    totalCommands: 0,
    totalDurationMs: 0,
    errorCount: 0,
    recent: [],
};

type MetricsAction = { type: 'record'; event: RecentCommand };

type MetricsReducer = (state: TelemetryMetrics, action: MetricsAction) => TelemetryMetrics;

const metricsReducer: MetricsReducer = (state, action) => {
    switch (action.type) {
        case 'record': {
            const totalCommands = state.totalCommands + 1;
            const totalDurationMs = state.totalDurationMs + action.event.durationMs;
            const errorCount = state.errorCount + (action.event.success ? 0 : 1);
            const recent = [action.event, ...state.recent].slice(0, MAX_RECENT_COMMANDS);
            return {
                totalCommands,
                totalDurationMs,
                errorCount,
                lastEvent: action.event,
                recent,
            };
        }
        default:
            return state;
    }
};

const formatMs = (value: number | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toFixed(2)}ms`;
};

const formatAverage = (metrics: TelemetryMetrics) =>
    metrics.totalCommands ? formatMs(metrics.totalDurationMs / metrics.totalCommands) : '—';

const formatAge = (ms: number | undefined) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms ago`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`;
    const minutes = ms / 60000;
    if (minutes < 60) return `${minutes.toFixed(1)}m ago`;
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h ago`;
};

type SectionProps = {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    subtitle?: string;
};

const Section: React.FC<SectionProps> = ({ title, open, onToggle, subtitle, children }) => (
    <div style={{ marginBottom: 12 }}>
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.9)',
                color: '#e2e8f0',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                cursor: 'pointer',
            }}
        >
            <span>{title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {subtitle ? <span style={{ opacity: 0.6, fontSize: 10 }}>{subtitle}</span> : null}
                <span style={{ fontSize: 12 }}>{open ? '▾' : '▸'}</span>
            </span>
        </button>
        {open ? <div style={{ marginTop: 6, padding: '0 2px' }}>{children}</div> : null}
    </div>
);

type CollapsibleCardProps = {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    subtitle?: string;
};

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({ title, open, onToggle, subtitle, children }) => (
    <div
        style={{
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 8,
            background: 'rgba(30, 41, 59, 0.55)',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.25)',
        }}
    >
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                fontSize: 12,
                color: '#e2e8f0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
            }}
        >
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                {subtitle ? <span style={{ opacity: 0.65 }}>{subtitle}</span> : null}
                <span>{open ? '▾' : '▸'}</span>
            </span>
        </button>
        {open ? <div style={{ padding: '10px 12px 12px 12px', borderTop: '1px solid rgba(148, 163, 184, 0.25)' }}>{children}</div> : null}
    </div>
);

type UndoEntry = {
    index: number;
    hasScenePatch: boolean;
    hasTimelinePatch: boolean;
    source?: string;
    ageMs: number;
    mergeKey: string | null;
    transient: boolean;
};

type UndoDebugInfo = {
    index: number;
    size: number;
    entries: UndoEntry[];
};

type UndoSummary = {
    info: UndoDebugInfo;
    canUndo: boolean;
    canRedo: boolean;
};

const collectUndoSummary = (): UndoSummary | null => {
    if (typeof window === 'undefined') return null;
    const win = window as any;
    const controller = win.__mvmntUndo;
    let info: UndoDebugInfo | null = null;
    try {
        if (typeof win.getUndoStack === 'function') {
            info = win.getUndoStack();
        } else if (controller?.debugStack) {
            info = controller.debugStack();
        }
    } catch {
        info = null;
    }
    if (!info) return null;
    return {
        info,
        canUndo: !!controller?.canUndo?.(),
        canRedo: !!controller?.canRedo?.(),
    };
};

const renderRecentList = (events: RecentCommand[], emptyLabel: string) => {
    if (!events.length) {
        return <div style={{ opacity: 0.65, fontSize: 11 }}>{emptyLabel}</div>;
    }
    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0', display: 'grid', gap: 4 }}>
            {events.map((event) => (
                <li key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {event.label}
                        <span style={{ opacity: 0.6 }}> ({event.source})</span>
                        {event.details ? <span style={{ opacity: 0.55 }}> · {event.details}</span> : null}
                    </span>
                    <span style={{ color: event.success ? '#38bdf8' : '#f87171' }}>{formatMs(event.durationMs)}</span>
                </li>
            ))}
        </ul>
    );
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
    if (descriptor.channel != null) {
        parts.push(`channel:${descriptor.channel}`);
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

export const DeveloperOverlay: React.FC = () => {
    const isProd = process.env.NODE_ENV === 'production';
    const appMode = import.meta.env.VITE_APP_MODE;
    const isBetaMode = appMode === 'beta';
    const defaultEnabled = !isProd && !isBetaMode;
    const transportCoordinator = React.useMemo(() => getTransportCoordinator(), []);
    const [, forceRender] = React.useReducer((x) => x + 1, 0);
    const [enabled, setEnabled] = React.useState(defaultEnabled);
    const enabledRef = React.useRef(defaultEnabled);
    const [visible, setVisible] = React.useState(defaultEnabled);
    const [sceneMetrics, dispatchSceneMetrics] = React.useReducer(metricsReducer, initialMetrics);
    const [timelineMetrics, dispatchTimelineMetrics] = React.useReducer(metricsReducer, initialMetrics);
    const commandId = React.useRef(0);
    const [sectionsOpen, setSectionsOpen] = React.useState({
        transport: true,
        scene: false,
        timeline: false,
        audio: false,
        undo: false,
    });
    const [audioSubSectionsOpen, setAudioSubSectionsOpen] = React.useState({
        requests: true,
        caches: true,
        diagnostics: false,
    });
    const [expandedRequests, setExpandedRequests] = React.useState<Record<string, boolean>>({});
    const [expandedCaches, setExpandedCaches] = React.useState<Record<string, boolean>>({});
    const [expandedDiagnostics, setExpandedDiagnostics] = React.useState<Record<string, boolean>>({});
    const [undoSummary, setUndoSummary] = React.useState<UndoSummary | null>(() => collectUndoSummary());
    const intentsByElement = useAudioDiagnosticsStore((state) => state.intentsByElement);
    const diffs = useAudioDiagnosticsStore((state) => state.diffs);
    const audioFeatureCaches = useTimelineStore((state) => state.audioFeatureCaches);
    const audioFeatureCacheStatus = useTimelineStore((state) => state.audioFeatureCacheStatus);

    const toggleSection = (key: keyof typeof sectionsOpen) => {
        setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleAudioSubSection = (key: keyof typeof audioSubSectionsOpen) => {
        setAudioSubSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleExpanded = (
        updater: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
        key: string,
    ) => {
        updater((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    React.useEffect(() => {
        if (!enabled || !transportCoordinator) return;
        const unsubscribe = transportCoordinator.subscribe(() => forceRender());
        return () => {
            unsubscribe();
        };
    }, [transportCoordinator, enabled]);

    React.useEffect(() => {
        if (!enabled) return;
        const unsubscribe = registerSceneCommandListener((event) => {
            commandId.current += 1;
            dispatchSceneMetrics({
                type: 'record',
                event: {
                    id: commandId.current,
                    label: event.command.type,
                    source: event.source,
                    durationMs: event.durationMs,
                    success: event.success,
                    details: event.mergeKey ? `merge:${event.mergeKey}` : undefined,
                },
            });
        });
        return () => {
            unsubscribe();
        };
    }, [enabled]);

    React.useEffect(() => {
        if (!enabled) return;
        const unsubscribe = registerTimelineCommandListener((event) => {
            commandId.current += 1;
            dispatchTimelineMetrics({
                type: 'record',
                event: {
                    id: commandId.current,
                    label: event.telemetryEvent || event.commandId,
                    source: event.source,
                    durationMs: event.durationMs,
                    success: event.success,
                    details: event.undoLabel,
                },
            });
        });
        return () => {
            unsubscribe();
        };
    }, [enabled]);

    React.useEffect(() => {
        if (!enabled) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
                event.preventDefault();
                setVisible((prev) => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enabled]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const win = window as typeof window & { __mvmntDebugSettings?: DebugSettings };
        const applySettings = (settings?: DebugSettings) => {
            if (!settings) return;
            const nextEnabled = !!settings.showDevelopmentOverlay;
            const wasEnabled = enabledRef.current;
            enabledRef.current = nextEnabled;
            setEnabled(nextEnabled);
            if (nextEnabled && !wasEnabled) {
                setVisible(true);
            } else if (!nextEnabled && wasEnabled) {
                setVisible(false);
            } else if (!nextEnabled) {
                setVisible(false);
            }
        };
        applySettings(win.__mvmntDebugSettings);
        const listener = (event: Event) => {
            const detail = (event as CustomEvent<DebugSettings>).detail;
            applySettings(detail);
        };
        window.addEventListener('mvmnt-debug-settings-changed', listener as EventListener);
        return () => {
            window.removeEventListener('mvmnt-debug-settings-changed', listener as EventListener);
        };
    }, []);

    React.useEffect(() => {
        if (!visible) return;
        if (typeof window === 'undefined') return;
        const update = () => setUndoSummary(collectUndoSummary());
        update();
        const id = window.setInterval(update, 1000);
        return () => {
            window.clearInterval(id);
        };
    }, [visible]);

    const featureRequests = React.useMemo(() => {
        const entries = Object.values(intentsByElement ?? {});
        return entries.sort((a, b) => {
            if (a.trackRef !== b.trackRef) {
                return a.trackRef.localeCompare(b.trackRef);
            }
            return a.elementId.localeCompare(b.elementId);
        });
    }, [intentsByElement]);

    const cacheEntries = React.useMemo(() => {
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

    if (!enabled || !visible || !transportCoordinator) {
        return null;
    }

    const transportState = transportCoordinator.getState();
    const sceneAverage = formatAverage(sceneMetrics);
    const timelineAverage = formatAverage(timelineMetrics);

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                background: 'rgba(15, 23, 42, 0.88)',
                color: '#cbd5f5',
                fontSize: 12,
                padding: '16px 18px',
                fontFamily:
                    'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                borderRadius: 12,
                zIndex: 9999,
                width: 420,
                maxHeight: '82vh',
                overflowY: 'auto',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(148, 163, 184, 0.35)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ letterSpacing: 0.5 }}>Development Overlay</strong>
                <span style={{ fontSize: 10, opacity: 0.75 }}>Press ? to toggle</span>
            </div>

            <Section
                title="Transport"
                open={sectionsOpen.transport}
                onToggle={() => toggleSection('transport')}
            >
                <div>Mode: <span style={{ color: '#4ade80' }}>{transportState.mode}</span></div>
                <div>Source: <span>{transportState.source}</span></div>
                <div>Tick: <span>{transportState.lastDerivedTick}</span></div>
            </Section>

            <Section
                title="Scene Telemetry"
                open={sectionsOpen.scene}
                onToggle={() => toggleSection('scene')}
                subtitle={`${sceneMetrics.totalCommands} cmds`}
            >
                <div>Total commands: <span>{sceneMetrics.totalCommands}</span></div>
                <div>
                    Errors:{' '}
                    <span style={{ color: sceneMetrics.errorCount ? '#f87171' : '#cbd5f5' }}>{sceneMetrics.errorCount}</span>
                </div>
                <div>Avg duration: <span>{sceneAverage}</span></div>
                {sceneMetrics.lastEvent ? (
                    <div style={{ marginTop: 4 }}>
                        Last command:{' '}
                        <span>
                            {sceneMetrics.lastEvent.label} · {sceneMetrics.lastEvent.source} ·{' '}
                            {formatMs(sceneMetrics.lastEvent.durationMs)} ·{' '}
                            {sceneMetrics.lastEvent.success ? 'ok' : 'failed'}
                        </span>
                    </div>
                ) : null}
                {renderRecentList(sceneMetrics.recent.slice(0, 3), 'No scene commands yet.')}
            </Section>

            <Section
                title="Timeline Telemetry"
                open={sectionsOpen.timeline}
                onToggle={() => toggleSection('timeline')}
                subtitle={`${timelineMetrics.totalCommands} cmds`}
            >
                <div>Total commands: <span>{timelineMetrics.totalCommands}</span></div>
                <div>
                    Errors:{' '}
                    <span style={{ color: timelineMetrics.errorCount ? '#f87171' : '#cbd5f5' }}>{timelineMetrics.errorCount}</span>
                </div>
                <div>Avg duration: <span>{timelineAverage}</span></div>
                {timelineMetrics.lastEvent ? (
                    <div style={{ marginTop: 4 }}>
                        Last command:{' '}
                        <span>
                            {timelineMetrics.lastEvent.label} · {timelineMetrics.lastEvent.source} ·{' '}
                            {formatMs(timelineMetrics.lastEvent.durationMs)} ·{' '}
                            {timelineMetrics.lastEvent.success ? 'ok' : 'failed'}
                        </span>
                    </div>
                ) : null}
                {renderRecentList(timelineMetrics.recent, 'No timeline commands yet.')}
            </Section>

            <Section
                title="Audio Features"
                open={sectionsOpen.audio}
                onToggle={() => toggleSection('audio')}
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
                                                        <span style={{ color: '#f97316', fontWeight: 600 }}>issues</span>
                                                    ) : (
                                                        <span style={{ opacity: 0.6 }}>ok</span>
                                                    )}
                                                    <span>{expanded ? '▾' : '▸'}</span>
                                                </span>
                                            </button>
                                            {expanded ? (
                                                <div style={{ padding: '0 12px 12px 12px', fontSize: 11, display: 'grid', gap: 8 }}>
                                                    <div style={{ opacity: 0.7 }}>
                                                        Track: {record.trackRef}
                                                        {record.analysisProfileId ? ` · profile:${record.analysisProfileId}` : ''}
                                                        {record.autoManaged ? ' · auto-managed' : ''}
                                                    </div>
                                                    {descriptors.length ? (
                                                        <div>
                                                            <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, marginBottom: 4 }}>
                                                                Published Descriptors
                                                            </div>
                                                            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                                {descriptors.map((label, index) => (
                                                                    <li key={`${key}-descriptor-${index}`}>{label}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : (
                                                        <div style={{ opacity: 0.6 }}>No descriptors published.</div>
                                                    )}
                                                    {missingRequirements.length ? (
                                                        <div style={{ color: '#f97316' }}>
                                                            Missing requirements:{' '}
                                                            {missingRequirements.join(', ')}
                                                        </div>
                                                    ) : null}
                                                    {unexpected ? (
                                                        <div style={{ color: '#facc15' }}>
                                                            {unexpected} unexpected descriptor{unexpected === 1 ? '' : 's'}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div style={{ opacity: 0.65, fontSize: 11 }}>No active scene feature requests.</div>
                        )}
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Audio Feature Caches"
                        open={audioSubSectionsOpen.caches}
                        onToggle={() => toggleAudioSubSection('caches')}
                        subtitle={`${cacheEntries.length} caches`}
                    >
                        {cacheEntries.length ? (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                                {cacheEntries.map((entry) => {
                                    const labels = collectCacheFeatureLabels(entry.cache);
                                    const statusLabel = formatCacheStatusSummary(entry.status);
                                    const updatedAgo = entry.status
                                        ? formatAge(Date.now() - entry.status.updatedAt)
                                        : null;
                                    const key = entry.key;
                                    const expanded = !!expandedCaches[key];
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
                                    const issueCount = diff.missing.length + diff.stale.length + diff.extraneous.length + diff.regenerating.length;
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
                                                <div style={{ padding: '0 12px 12px 12px', fontSize: 11, display: 'grid', gap: 8 }}>
                                                    {diff.missing.length ? (
                                                        <div>
                                                            <div style={{ color: '#f97316', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                                Missing
                                                            </div>
                                                            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                                {diff.missing.map((id) => (
                                                                    <li key={`${key}-missing-${id}`}>{formatCacheDiffDescriptor(diff, id)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {diff.stale.length ? (
                                                        <div>
                                                            <div style={{ color: '#eab308', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                                Stale
                                                            </div>
                                                            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                                {diff.stale.map((id) => (
                                                                    <li key={`${key}-stale-${id}`}>{formatCacheDiffDescriptor(diff, id)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {diff.extraneous.length ? (
                                                        <div>
                                                            <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                                Extraneous
                                                            </div>
                                                            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                                {diff.extraneous.map((id) => (
                                                                    <li key={`${key}-extraneous-${id}`}>{formatCacheDiffDescriptor(diff, id)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {diff.regenerating.length ? (
                                                        <div>
                                                            <div style={{ color: '#a855f7', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                                Regenerating
                                                            </div>
                                                            <ul style={{ listStyle: 'disc', paddingLeft: 18, margin: 0, display: 'grid', gap: 2 }}>
                                                                {diff.regenerating.map((id) => (
                                                                    <li key={`${key}-regenerating-${id}`}>{formatCacheDiffDescriptor(diff, id)}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {!issueCount ? (
                                                        <div style={{ opacity: 0.6 }}>No outstanding issues for this cache.</div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        </CollapsibleCard>
                    ) : null}
                </div>
            </Section>

            <Section
                title="Undo Stack"
                open={sectionsOpen.undo}
                onToggle={() => toggleSection('undo')}
            >
                {undoSummary ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                        <div>
                            Size: <span>{undoSummary.info.size}</span> · Index:{' '}
                            <span>{undoSummary.info.index}</span>
                        </div>
                        <div>
                            Can undo: <span>{undoSummary.canUndo ? 'yes' : 'no'}</span> · Can redo:{' '}
                            <span>{undoSummary.canRedo ? 'yes' : 'no'}</span>
                        </div>
                        {undoSummary.info.entries.length ? (
                            <div>
                                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>Recent entries</div>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                                    {[...undoSummary.info.entries]
                                        .slice(-5)
                                        .reverse()
                                        .map((entry) => (
                                            <li key={entry.index}>
                                                #{entry.index} · {entry.source ?? 'unknown'} ·
                                                <span style={{ marginLeft: 4 }}>
                                                    scene:{entry.hasScenePatch ? 'yes' : 'no'}
                                                </span>
                                                <span style={{ marginLeft: 4 }}>
                                                    timeline:{entry.hasTimelinePatch ? 'yes' : 'no'}
                                                </span>
                                                <span style={{ marginLeft: 4 }}>
                                                    transient:{entry.transient ? 'yes' : 'no'}
                                                </span>
                                                {entry.mergeKey ? (
                                                    <span style={{ marginLeft: 4 }}>merge:{entry.mergeKey}</span>
                                                ) : null}
                                                <span style={{ marginLeft: 4, opacity: 0.7 }}>
                                                    {formatAge(entry.ageMs)}
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        ) : (
                            <div style={{ opacity: 0.65, fontSize: 11 }}>Stack empty.</div>
                        )}
                    </div>
                ) : (
                    <div style={{ opacity: 0.65, fontSize: 11 }}>Undo stack unavailable.</div>
                )}
            </Section>
        </div>
    );
};
