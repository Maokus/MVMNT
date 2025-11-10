import React from 'react';
import type { DebugSettings } from '@context/visualizer/types';
import { getTransportCoordinator } from '@audio/transport-coordinator';
import { registerSceneCommandListener } from '@state/scene';
import { registerTimelineCommandListener } from '@state/timeline/timelineTelemetry';
import {
    AudioDiagnosticsSection,
} from './developerOverlay/AudioDiagnosticsSection';
import { TelemetrySection, type TelemetryEvent, type TelemetryMetrics } from './developerOverlay/TelemetrySection';
import { TransportSection } from './developerOverlay/TransportSection';
import { UndoSection } from './developerOverlay/UndoSection';

const MAX_RECENT_COMMANDS = 5;

const initialMetrics: TelemetryMetrics = {
    totalCommands: 0,
    totalDurationMs: 0,
    errorCount: 0,
    recent: [],
};

type MetricsAction = { type: 'record'; event: TelemetryEvent };

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

    if (!enabled || !visible || !transportCoordinator) {
        return null;
    }

    const transportState = transportCoordinator.getState() as {
        mode?: string;
        source?: string;
        lastDerivedTick?: number;
    };

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

            <TransportSection
                open={sectionsOpen.transport}
                onToggle={() => toggleSection('transport')}
                transportState={transportState}
            />

            <TelemetrySection
                title="Scene Telemetry"
                metrics={sceneMetrics}
                open={sectionsOpen.scene}
                onToggle={() => toggleSection('scene')}
                subtitle={`${sceneMetrics.totalCommands} cmds`}
                emptyLabel="No scene commands yet."
                maxRecent={3}
            />

            <TelemetrySection
                title="Timeline Telemetry"
                metrics={timelineMetrics}
                open={sectionsOpen.timeline}
                onToggle={() => toggleSection('timeline')}
                subtitle={`${timelineMetrics.totalCommands} cmds`}
                emptyLabel="No timeline commands yet."
            />

            <AudioDiagnosticsSection
                open={sectionsOpen.audio}
                onToggle={() => toggleSection('audio')}
            />

            <UndoSection
                open={sectionsOpen.undo}
                onToggle={() => toggleSection('undo')}
            />
        </div>
    );
};
