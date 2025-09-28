import type { SceneCommand, SceneCommandOptions, SceneCommandResult } from '@state/scene/commandGateway';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { exportScene, importScene } from '@persistence/index';
import type { ImportSceneResult } from '@persistence/index';
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

function normalizeImportPayload(payload: unknown): string | null {
    if (typeof payload === 'string') return payload;
    if (!payload) return null;
    try {
        return JSON.stringify(payload);
    } catch (error) {
        console.error('[mvmntTools] Failed to stringify payload for importScene', error);
        return null;
    }
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
    importScene: (payload: unknown): ImportSceneResult => {
        const normalized = normalizeImportPayload(payload);
        if (!normalized) {
            return { ok: false, errors: [{ message: 'Invalid payload' }], warnings: [] };
        }
        return importScene(normalized);
    },
};

export interface MvmntDevTools {
    scene: typeof sceneTools;
    timeline: typeof timelineTools;
    undo: typeof undoTools;
    persistence: typeof persistenceTools;
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
    };
    (window as any).mvmntTools = tools;
}
