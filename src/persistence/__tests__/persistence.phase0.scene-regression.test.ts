import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentGateway } from '@persistence/document-gateway';
import { useTimelineStore } from '@state/timelineStore';
import { buildEdgeMacroScene } from '@state/scene/fixtures/edgeMacroScene';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';
import { globalMacroManager } from '@bindings/macro-manager';
import { useSceneStore } from '@state/sceneStore';

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
        useSceneStore.getState().clearScene();
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
        withFrozenNow(() => {
            useSceneStore.getState().importScene(snapshot.scene);
        });
        // Provide builder handle so legacy consumers remain intact even though build no longer depends on it.
        (window as any).vis = { getSceneBuilder: () => builder };

        const doc = withFrozenNow(() => DocumentGateway.build());
        expect(doc.scene).toEqual(snapshot.scene);
    });

    it('strips legacy padding keys from scene settings when exporting', () => {
        withFrozenNow(() => {
            useSceneStore.getState().importScene({
                elements: [],
                sceneSettings: {
                    fps: 60,
                    width: 1000,
                    height: 800,
                    tempo: 110,
                    beatsPerBar: 5,
                    prePadding: 120,
                    postPadding: 60,
                },
                macros: null,
            });
        });

        const doc = DocumentGateway.build();
        expect(doc.scene.sceneSettings?.prePadding).toBeUndefined();
        expect(doc.scene.sceneSettings?.postPadding).toBeUndefined();
    });

    it('hydrates the store and macro manager when no builder is available', () => {
        delete (window as any).vis;
        delete (window as any).visualizer;

        const timeline = useTimelineStore.getState();
        const doc = {
            timeline: {
                ...timeline.timeline,
                globalBpm: 100,
                beatsPerBar: 3,
                masterTempoMap: [],
            },
            tracks: {},
            tracksOrder: [],
            playbackRange: null,
            playbackRangeUserDefined: false,
            rowHeight: timeline.rowHeight,
            midiCache: {},
            scene: fixture,
        } as const;

        withSilentConsole(() => DocumentGateway.apply(doc as any));

        const exported = withFrozenNow(() => useSceneStore.getState().exportSceneDraft());
        expect(exported.elements).toEqual(fixture.elements);
        expect(exported.sceneSettings).toEqual(fixture.sceneSettings);
        expect(exported.macros).toEqual(fixture.macros);
        expect(globalMacroManager.getMacro('macro.color.primary')).not.toBeNull();
    });
});
