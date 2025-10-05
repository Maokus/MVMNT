import React from 'react';
import { getTransportCoordinator } from '@audio/transport-coordinator';
import { registerSceneCommandListener } from '@state/scene';
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

export const TransportStatusDev: React.FC = () => {
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
        undo: false,
    });
    const [undoSummary, setUndoSummary] = React.useState<UndoSummary | null>(() => collectUndoSummary());

    const toggleSection = (key: keyof typeof sectionsOpen) => {
        setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
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
                bottom: 8,
                right: 8,
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#cbd5f5',
                fontSize: 12,
                padding: '12px 14px',
                fontFamily:
                    'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                borderRadius: 8,
                zIndex: 9999,
                width: 340,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(6px)',
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
