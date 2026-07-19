import type { SceneCommand, SceneCommandOptions, SceneCommandResult } from '@state/scene/commandGateway';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { dispatchTimelineCommandDescriptor, useTimelineStore } from '@state/timelineStore';
import type { TempoKeyframe } from '@core/timing/types';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { exportScene, importScene } from '@persistence/index';
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

export interface MvmntDevTools {
    scene: typeof sceneTools;
    timeline: typeof timelineTools;
    undo: typeof undoTools;
    persistence: typeof persistenceTools;
    diagnostics: typeof diagnosticsTools;
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
    };
    (window as any).mvmntTools = tools;
}
