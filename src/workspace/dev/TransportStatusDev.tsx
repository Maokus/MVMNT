import React from 'react';
import { getTransportCoordinator } from '@audio/transport-coordinator';
import { registerSceneCommandListener } from '@state/scene';

interface RecentCommand {
    id: number;
    type: string;
    source: string;
    durationMs: number;
    success: boolean;
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

function metricsReducer(state: TelemetryMetrics, action: MetricsAction): TelemetryMetrics {
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
}

const formatMs = (value: number | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toFixed(2)}ms`;
};

export const TransportStatusDev: React.FC = () => {
    const isProd = process.env.NODE_ENV === 'production';
    const transportCoordinator = React.useMemo(() => (isProd ? null : getTransportCoordinator()), [isProd]);
    const [, forceRender] = React.useReducer((x) => x + 1, 0);
    const [visible, setVisible] = React.useState(!isProd);
    const [metrics, dispatchMetrics] = React.useReducer(metricsReducer, initialMetrics);
    const commandId = React.useRef(0);

    React.useEffect(() => {
        if (!transportCoordinator) return;
        const unsubscribe = transportCoordinator.subscribe(() => forceRender());
        return () => {
            unsubscribe();
        };
    }, [transportCoordinator]);

    React.useEffect(() => {
        if (isProd) return;
        const unsubscribe = registerSceneCommandListener((event) => {
            commandId.current += 1;
            dispatchMetrics({
                type: 'record',
                event: {
                    id: commandId.current,
                    type: event.command.type,
                    source: event.source,
                    durationMs: event.durationMs,
                    success: event.success,
                },
            });
        });
        return () => {
            unsubscribe();
        };
    }, [isProd]);

    React.useEffect(() => {
        if (isProd) return;
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
    }, [isProd]);

    if (isProd || !visible || !transportCoordinator) {
        return null;
    }

    const transportState = transportCoordinator.getState();
    const averageDuration = metrics.totalCommands ? metrics.totalDurationMs / metrics.totalCommands : undefined;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 8,
                right: 8,
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#cbd5f5',
                fontSize: 12,
                padding: '10px 12px',
                fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                borderRadius: 8,
                zIndex: 9999,
                width: 320,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(6px)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ letterSpacing: 0.5 }}>Development Overlay</strong>
                <span style={{ fontSize: 10, opacity: 0.75 }}>Press ? to toggle</span>
            </div>

            <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>Transport</div>
                <div>
                    Mode: <span style={{ color: '#4ade80' }}>{transportState.mode}</span>
                </div>
                <div>
                    Source: <span>{transportState.source}</span>
                </div>
                <div>
                    Tick: <span>{transportState.lastDerivedTick}</span>
                </div>
            </div>

            <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>Scene Telemetry</div>
                <div>
                    Total commands: <span>{metrics.totalCommands}</span>
                </div>
                <div>
                    Errors: <span style={{ color: metrics.errorCount ? '#f87171' : '#cbd5f5' }}>{metrics.errorCount}</span>
                </div>
                <div>
                    Avg duration: <span>{formatMs(averageDuration)}</span>
                </div>
                {metrics.lastEvent ? (
                    <div style={{ marginTop: 4 }}>
                        Last command:{' '}
                        <span>
                            {metrics.lastEvent.type} · {metrics.lastEvent.source} · {formatMs(metrics.lastEvent.durationMs)} ·{' '}
                            {metrics.lastEvent.success ? 'ok' : 'failed'}
                        </span>
                    </div>
                ) : null}
            </div>

            {metrics.recent.length ? (
                <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>Recent commands</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {metrics.recent.map((event) => (
                            <li key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {event.type} <span style={{ opacity: 0.6 }}>({event.source})</span>
                                </span>
                                <span style={{ color: event.success ? '#38bdf8' : '#f87171' }}>{formatMs(event.durationMs)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
};
