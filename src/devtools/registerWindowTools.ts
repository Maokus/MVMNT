import type { SceneCommand, SceneCommandOptions, SceneCommandResult } from '@state/scene/commandGateway';
import { dispatchSceneCommand, registerSceneCommandListener } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { dispatchTimelineCommandDescriptor, useTimelineStore } from '@state/timelineStore';
import type { TempoKeyframe } from '@core/timing/types';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { exportScene, importScene } from '@persistence/index';
import { renderResourceManager } from '@core/render/render-resource-manager';
import type { ImportSceneResult } from '@persistence/index';
import type { ImportSceneInput } from '@persistence/import';
import {
    getTimingState,
    setGlobalBpm,
    setBeatsPerBar,
    setMasterTempoMap,
    setCurrentTick,
    s2b,
    b2s,
    s2bars,
    bars2s,
    getBeatGrid,
} from '@core/timing/debug-tools';

function runSceneCommand(command: SceneCommand, options?: SceneCommandOptions): SceneCommandResult | null {
    return dispatchSceneCommand(command, options);
}

function normalizeImportPayload(payload: unknown): ImportSceneInput | null {
    if (payload instanceof Uint8Array || payload instanceof ArrayBuffer) return payload;
    if (typeof Blob !== 'undefined' && payload instanceof Blob) return payload;
    return null;
}

type UndoControllerLike = {
    debugStack?: () => unknown;
    dump?: (index?: number) => unknown;
    canUndo?: () => boolean;
    canRedo?: () => boolean;
    undo?: () => void;
    redo?: () => void;
    reset?: () => void;
};

function resolveUndo(): UndoControllerLike | null {
    const undo = (window as any).__mvmntUndo;
    if (undo && typeof undo === 'object') return undo as UndoControllerLike;
    return null;
}

const sceneTools = {
    getState: () => useSceneStore.getState(),
    exportDraft: () => useSceneStore.getState().exportSceneDraft(),
    dispatch: runSceneCommand,
};

const timelineTools = {
    getState: () => useTimelineStore.getState(),
    dispatchDescriptor: dispatchTimelineCommandDescriptor,
    setGlobalBpm,
    setBeatsPerBar,
    setMasterTempoMap,
    setCurrentTick,
    getBeatGrid,
    s2b,
    b2s,
    s2bars,
    bars2s,
    getTimingState,
    setTempoKeyframes: (keyframes: TempoKeyframe[]) => {
        const api = useTimelineStore.getState();
        if (!api.timeline.tempoAutomation?.enabled) {
            api.enableTempoAutomation();
        }
        api.batchSetTempoKeyframes(keyframes);
    },
    enableTempoAutomation: () => {
        useTimelineStore.getState().enableTempoAutomation();
    },
    disableTempoAutomation: () => {
        useTimelineStore.getState().disableTempoAutomation();
    },
};

const undoTools = {
    stack: () => resolveUndo()?.debugStack?.(),
    dump: (index?: number) => resolveUndo()?.dump?.(index),
    canUndo: () => !!resolveUndo()?.canUndo?.(),
    canRedo: () => !!resolveUndo()?.canRedo?.(),
    undo: () => resolveUndo()?.undo?.(),
    redo: () => resolveUndo()?.redo?.(),
    reset: () => resolveUndo()?.reset?.(),
};

const persistenceTools = {
    exportScene,
    importScene: async (payload: unknown): Promise<ImportSceneResult> => {
        const normalized = normalizeImportPayload(payload);
        if (!normalized) {
            return { ok: false, errors: [{ message: 'Invalid payload' }], warnings: [] };
        }
        return importScene(normalized);
    },
};

const diagnosticsTools = {
    getState: () => useAudioDiagnosticsStore.getState(),
    historySummary: () => useAudioDiagnosticsStore.getState().getHistorySummary(),
};

type CommandMetric = { count: number; totalDurationMs: number; maxDurationMs: number };
const sceneCommandMetrics = new Map<string, CommandMetric>();

registerSceneCommandListener((event) => {
    const key = `${event.command.type}:${event.source}`;
    const current = sceneCommandMetrics.get(key) ?? { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
    current.count += 1;
    current.totalDurationMs += event.durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, event.durationMs);
    sceneCommandMetrics.set(key, current);
});

const performanceTools = {
    snapshot: () => {
        const visualizer = (window as any).debugVisualizer ?? (window as any).vis;
        return {
            visualizer: visualizer?.getPerformanceDiagnostics?.() ?? null,
            renderResources: renderResourceManager.getDiagnostics(),
            sceneCommands: Object.fromEntries(
                [...sceneCommandMetrics.entries()].map(([key, metric]) => [
                    key,
                    {
                        ...metric,
                        averageDurationMs: metric.count ? metric.totalDurationMs / metric.count : 0,
                    },
                ])
            ),
            heap:
                (
                    performance as Performance & {
                        memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
                    }
                ).memory ?? null,
        };
    },
    reset: () => sceneCommandMetrics.clear(),
};

export interface MvmntDevTools {
    scene: typeof sceneTools;
    timeline: typeof timelineTools;
    undo: typeof undoTools;
    persistence: typeof persistenceTools;
    diagnostics: typeof diagnosticsTools;
    performance: typeof performanceTools;
}

declare global {
    interface Window {
        mvmntTools?: MvmntDevTools;
    }
}

if (typeof window !== 'undefined') {
    const tools: MvmntDevTools = {
        scene: sceneTools,
        timeline: timelineTools,
        undo: undoTools,
        persistence: persistenceTools,
        diagnostics: diagnosticsTools,
        performance: performanceTools,
    };
    (window as any).mvmntTools = tools;
}
