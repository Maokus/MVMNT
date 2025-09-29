import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createSnapshotUndoController,
    instrumentSceneStoreForUndo,
    instrumentTimelineStoreForUndo,
} from '@state/undo/snapshot-undo';
import { useTimelineStore } from '@state/timelineStore';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

function withFrozenNow<T>(fn: () => T, timestamp = 1700000000000): T {
    const originalNow = Date.now;
    (Date as any).now = () => timestamp;
    try {
        return fn();
    } finally {
        (Date as any).now = originalNow;
    }
}

function withSilentConsole<T>(fn: () => T): T {
    const originalLog = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = originalLog;
    }
}

describe('Scene store undo instrumentation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        useTimelineStore.setState((state: any) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            midiCache: {},
            playbackRange: null,
            playbackRangeUserDefined: false,
        }));
        (globalThis as any).window = (globalThis as any).window || {};
    });

    afterEach(() => {
        vi.useRealTimers();
        useSceneStore.getState().clearScene();
        useSceneStore.getState().replaceMacros(null);
        delete (window as any).vis;
        delete (window as any).__mvmntUndo;
    });

    it('captures store mutations and replays them via undo/redo', async () => {
        const undo: any = withSilentConsole(() =>
            withFrozenNow(() => createSnapshotUndoController(useTimelineStore, { debounceMs: 1 }))
        );
        instrumentSceneStoreForUndo();

        dispatchSceneCommand(
            {
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'undo-test',
                config: { id: 'undo-test', text: { type: 'constant', value: 'Baseline Scene' } },
            },
            { source: 'undo-test:add' }
        );
        await vi.runAllTimersAsync();

        expect(undo.canUndo()).toBe(true);
        const stackAfterAdd = undo.debugStack();
        expect(stackAfterAdd.entries.length).toBeGreaterThan(1);

        undo.undo();
        await vi.runAllTimersAsync();
        expect(useSceneStore.getState().elements['undo-test']).toBeUndefined();
        expect(undo.canRedo()).toBe(true);

        undo.redo();
        await vi.runAllTimersAsync();
        expect(useSceneStore.getState().elements['undo-test']).toBeTruthy();
    });

    it('maintains undo history across macro edits and timeline changes', async () => {
        const undo: any = withSilentConsole(() =>
            withFrozenNow(() => createSnapshotUndoController(useTimelineStore, { debounceMs: 1 }))
        );
        instrumentSceneStoreForUndo();
        instrumentTimelineStoreForUndo();

        dispatchSceneCommand(
            { type: 'createMacro', macroId: 'macro.undo', definition: { type: 'number', value: 1 } },
            { source: 'undo-test:create' }
        );
        await vi.runAllTimersAsync();

        const initialBpm = useTimelineStore.getState().timeline.globalBpm;

        dispatchSceneCommand(
            { type: 'updateMacroValue', macroId: 'macro.undo', value: 5 },
            { source: 'undo-test:update-1' }
        );
        await vi.runAllTimersAsync();

        useTimelineStore.getState().setGlobalBpm(138);
        await vi.runAllTimersAsync();

        const captureState = () => ({
            macroValue: useSceneStore.getState().macros.byId['macro.undo']?.value ?? null,
            bpm: useTimelineStore.getState().timeline.globalBpm,
        });

        const finalState = captureState();
        expect(finalState).toMatchObject({ macroValue: 5, bpm: 138 });

        const stack = undo.debugStack();
        const snapshotMacros = stack.entries.map((_: unknown, index: number) => {
            const dump = undo.dump(index) as any;
            const macros = dump?.scene?.macros?.macros ?? {};
            const bpm = dump?.timeline?.globalBpm ?? initialBpm;
            const macroValue = macros['macro.undo'] ? macros['macro.undo'].value : null;
            return { macroValue, bpm };
        });
        expect(snapshotMacros.some((entry: { macroValue: number | null; bpm: number }) => entry.macroValue === 5 && entry.bpm === 138)).toBe(true);
        expect(stack.entries.length).toBeGreaterThanOrEqual(2);
        expect(snapshotMacros.some((entry: { macroValue: number | null }) => entry.macroValue === 5)).toBe(true);
        expect(snapshotMacros[0].macroValue).toBeNull();
        expect(snapshotMacros[0].bpm).toBe(initialBpm);
    });
});
