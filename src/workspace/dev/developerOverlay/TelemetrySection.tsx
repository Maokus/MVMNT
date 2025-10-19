import React from 'react';
import { Section } from './Section';

export interface TelemetryEvent {
    id: number;
    label: string;
    source: string;
    durationMs: number;
    success: boolean;
    details?: string;
}

export interface TelemetryMetrics {
    totalCommands: number;
    totalDurationMs: number;
    errorCount: number;
    lastEvent?: TelemetryEvent;
    recent: TelemetryEvent[];
}

const formatMs = (value: number | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toFixed(2)}ms`;
};

const formatAverage = (metrics: TelemetryMetrics) =>
    metrics.totalCommands ? formatMs(metrics.totalDurationMs / metrics.totalCommands) : '—';

const renderRecentList = (events: TelemetryEvent[], emptyLabel: string) => {
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

type TelemetrySectionProps = {
    title: string;
    metrics: TelemetryMetrics;
    open: boolean;
    onToggle: () => void;
    subtitle?: string;
    emptyLabel: string;
    maxRecent?: number;
};

export const TelemetrySection: React.FC<TelemetrySectionProps> = ({
    title,
    metrics,
    open,
    onToggle,
    subtitle,
    emptyLabel,
    maxRecent,
}) => {
    const recent = typeof maxRecent === 'number' ? metrics.recent.slice(0, maxRecent) : metrics.recent;
    const average = formatAverage(metrics);

    return (
        <Section title={title} open={open} onToggle={onToggle} subtitle={subtitle}>
            <div>Total commands: <span>{metrics.totalCommands}</span></div>
            <div>
                Errors:{' '}
                <span style={{ color: metrics.errorCount ? '#f87171' : '#cbd5f5' }}>
                    {metrics.errorCount}
                </span>
            </div>
            <div>Avg duration: <span>{average}</span></div>
            {metrics.lastEvent ? (
                <div style={{ marginTop: 4 }}>
                    Last command:{' '}
                    <span>
                        {metrics.lastEvent.label} · {metrics.lastEvent.source} · {formatMs(metrics.lastEvent.durationMs)} ·{' '}
                        {metrics.lastEvent.success ? 'ok' : 'failed'}
                    </span>
                </div>
            ) : null}
            {renderRecentList(recent, emptyLabel)}
        </Section>
    );
};
