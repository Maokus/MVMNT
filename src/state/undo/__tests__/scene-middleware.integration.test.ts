import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridSceneBuilder } from '@core/scene-builder';
import { createSnapshotUndoController, instrumentSceneBuilderForUndo } from '@state/undo/snapshot-undo';
import { useTimelineStore } from '@state/timelineStore';
import { globalMacroManager } from '@bindings/macro-manager';

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

describe('Scene builder undo instrumentation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        globalMacroManager.clearMacros();
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
        globalMacroManager.clearMacros();
        delete (window as any).vis;
        delete (window as any).__mvmntUndo;
    });

    it('captures builder mutations and replays them via undo/redo', async () => {
        const builder = new HybridSceneBuilder();
        builder.clearElements();
        (window as any).vis = { getSceneBuilder: () => builder };

        const undo: any = withSilentConsole(() =>
            withFrozenNow(() => createSnapshotUndoController(useTimelineStore, { debounceMs: 1 }))
        );
        instrumentSceneBuilderForUndo(builder);

        builder.addElementFromRegistry('textOverlay', { id: 'undo-test', text: 'Phase 0' });
        await vi.runAllTimersAsync();

        expect(undo.canUndo()).toBe(true);
        const stackAfterAdd = undo.debugStack();
        expect(stackAfterAdd.entries.length).toBeGreaterThan(1);

        undo.undo();
        await vi.runAllTimersAsync();
        expect(builder.getElement('undo-test')).toBeFalsy();
        expect(undo.canRedo()).toBe(true);

        undo.redo();
        await vi.runAllTimersAsync();
        expect(builder.getElement('undo-test')).toBeTruthy();
    });
});
