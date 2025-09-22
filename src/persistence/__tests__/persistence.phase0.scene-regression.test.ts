import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentGateway } from '@persistence/document-gateway';
import { useTimelineStore } from '@state/timelineStore';
import { buildEdgeMacroScene } from '@state/scene/fixtures/edgeMacroScene';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';
import { snapshotBuilder } from '@state/scene/snapshotBuilder';
import { globalMacroManager } from '@bindings/macro-manager';
import { HybridSceneBuilder } from '@core/scene-builder';

const FIXED_TIMESTAMP = 1700000000000;

declare global {
    interface Window {
        vis?: any;
        visualizer?: any;
    }
}

function withFrozenNow<T>(fn: () => T): T {
    const originalNow = Date.now;
    (Date as any).now = () => FIXED_TIMESTAMP;
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

describe('DocumentGateway scene regression (Phase 0)', () => {
    beforeEach(() => {
        globalMacroManager.clearMacros();
        useTimelineStore.setState((state: any) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            midiCache: {},
            playbackRange: null,
            playbackRangeUserDefined: false,
            timeline: {
                ...state.timeline,
                globalBpm: 120,
                beatsPerBar: 4,
                masterTempoMap: [],
            },
        }));
        (globalThis as any).window = (globalThis as any).window || {};
    });

    afterEach(() => {
        globalMacroManager.clearMacros();
        delete (window as any).vis;
        delete (window as any).visualizer;
    });

    it('exports the edge macro scene snapshot via DocumentGateway.build', () => {
        const { builder, snapshot } = buildEdgeMacroScene();
        (window as any).vis = { getSceneBuilder: () => builder };

        const doc = withFrozenNow(() => DocumentGateway.build());
        expect(doc.scene).toEqual(snapshot.scene);
    });

    it('rehydrates builder + macros from the stored fixture', () => {
        const builder = new HybridSceneBuilder();
        builder.clearElements();
        (window as any).vis = { getSceneBuilder: () => builder };

        const state = useTimelineStore.getState();
        const doc = {
            timeline: {
                ...state.timeline,
                globalBpm: 120,
                beatsPerBar: 4,
                masterTempoMap: [],
            },
            tracks: {},
            tracksOrder: [],
            playbackRange: null,
            playbackRangeUserDefined: false,
            rowHeight: state.rowHeight,
            midiCache: {},
            scene: fixture,
        } as const;

        withSilentConsole(() => DocumentGateway.apply(doc as any));

        const snapshot = withFrozenNow(() => snapshotBuilder(builder));
        expect(snapshot.scene).toEqual(fixture);
    });
});
