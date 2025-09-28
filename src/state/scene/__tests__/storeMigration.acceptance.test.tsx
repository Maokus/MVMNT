import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';
import { createSceneStore, useSceneStore } from '@state/sceneStore';
import { createSceneSelectors } from '@state/scene/selectors';
import {
    dispatchSceneCommand,
    SceneRuntimeAdapter,
    useSceneElements,
    useSceneSelection,
    useMacroAssignments,
} from '@state/scene';
import { DocumentGateway } from '@persistence/document-gateway';
import { useTimelineStore } from '@state/timelineStore';

function resetTimelineStore() {
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
}

describe('store migration acceptance criteria', () => {
    beforeEach(() => {
        act(() => {
            useSceneStore.getState().clearScene();
            useSceneStore.getState().replaceMacros(null);
        });
        resetTimelineStore();
    });

    afterEach(() => {
        act(() => {
            useSceneStore.getState().clearScene();
            useSceneStore.getState().replaceMacros(null);
        });
        resetTimelineStore();
    });

    describe('phase 1 – store scaffolding', () => {
        it('imports and exports the regression fixture in store-only mode', () => {
            const store = createSceneStore();
            store.getState().importScene(fixture as any);

            const exported = store.getState().exportSceneDraft();
            expect(exported.sceneSettings).toEqual(fixture.sceneSettings);
            expect(exported.elements).toEqual(fixture.elements);
            expect(exported.macros).toEqual(fixture.macros);
        });

        it('keeps selector references stable across unrelated updates', () => {
            const store = createSceneStore();
            store.getState().importScene(fixture as any);
            const selectors = createSceneSelectors();

            const first = selectors.selectOrderedElements(store.getState());
            store.getState().updateSettings({ width: 1920 });
            const second = selectors.selectOrderedElements(store.getState());

            expect(second).toBe(first);
        });
    });

    describe('phase 2 – dual-write gateway', () => {
        it('routes mutations through the gateway and updates the store', () => {
            const result = dispatchSceneCommand({
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'phase-2-element',
                config: {
                    id: 'phase-2-element',
                    text: { type: 'constant', value: 'Phase 2' },
                },
            });

            expect(result.success).toBe(true);

            const state = useSceneStore.getState();
            expect(state.order).toContain('phase-2-element');
            expect(state.bindings.byElement['phase-2-element'].text).toEqual({
                type: 'constant',
                value: 'Phase 2',
            });
        });
    });

    describe('phase 3 – store-first UI hooks', () => {
        beforeEach(() => {
            act(() => {
                useSceneStore.getState().importScene(fixture as any);
            });
        });

        it('exposes ordered scene elements with derived metadata', () => {
            const { result } = renderHook(() => useSceneElements());
            expect(result.current.length).toBeGreaterThan(0);
            const [first] = result.current;
            expect(first).toMatchObject({ id: expect.any(String), visible: expect.any(Boolean) });
        });

        it('derives selection state from the scene store', () => {
            const { result } = renderHook(() => useSceneSelection());
            expect(result.current.hasSelection).toBe(false);

            act(() => {
                useSceneStore.getState().setInteractionState({ selectedElementIds: ['title'] });
            });

            expect(result.current.hasSelection).toBe(true);
            expect(result.current.primaryId).toBe('title');
        });

        it('provides macro assignment lookups via hooks', () => {
            const { result } = renderHook(() => useMacroAssignments());
            expect(result.current.some((entry) => entry.macroId === 'macro.color.primary')).toBe(true);
            const assignment = result.current.find((entry) => entry.macroId === 'macro.color.primary');
            expect(assignment).toMatchObject({ elementId: 'title', propertyPath: 'color' });
        });
    });

    describe('phase 4 – runtime adapter', () => {
        it('hydrates elements from the store and tracks cache versions', () => {
            const store = createSceneStore();
            store.getState().importScene(fixture as any);
            const adapter = new SceneRuntimeAdapter({ store });
            try {
                const ids = adapter.getElements().map((el) => el.id);
                expect(ids).toEqual(store.getState().order);

                const beforeVersion = adapter.getElementVersion('title');
                store.getState().updateBindings('title', { visible: { type: 'constant', value: false } });
                const afterVersion = adapter.getElementVersion('title');
                expect(afterVersion).toBeGreaterThan(beforeVersion);
            } finally {
                adapter.dispose();
            }
        });
    });

    describe('phase 5 – macro consolidation & undo', () => {
        it('keeps macro inverse index synchronized after edits', () => {
            const store = createSceneStore();
            store.getState().importScene(fixture as any);

            store.getState().updateBindings('title', {
                color: { type: 'constant', value: '#ffffff' },
            });
            expect(store.getState().bindings.byMacro['macro.color.primary']).toBeUndefined();

            store.getState().updateBindings('title', {
                color: { type: 'macro', macroId: 'macro.color.primary' },
            });

            expect(store.getState().bindings.byMacro['macro.color.primary']).toEqual([
                { elementId: 'title', propertyPath: 'color' },
            ]);
        });
    });

    describe('phase 6 – persistence refactor', () => {
        it('builds documents from the store without legacy globals', () => {
            useSceneStore.getState().importScene(fixture as any);
            const doc = DocumentGateway.build();
            expect(doc.scene.elements).toEqual(fixture.elements);
            expect(doc.scene.sceneSettings).toEqual(fixture.sceneSettings);
        });

        it('applies documents into the store with only the Zustand gateway', () => {
            useSceneStore.getState().clearScene();

            const doc = {
                timeline: useTimelineStore.getState().timeline,
                tracks: {},
                tracksOrder: [],
                playbackRange: null,
                playbackRangeUserDefined: false,
                rowHeight: useTimelineStore.getState().rowHeight,
                midiCache: {},
                scene: fixture,
            } as const;

            DocumentGateway.apply(doc as any);

            const exported = useSceneStore.getState().exportSceneDraft();
            expect(exported.elements).toEqual(fixture.elements);
            expect(exported.sceneSettings).toEqual(fixture.sceneSettings);
            expect(exported.macros).toEqual(fixture.macros);
        });
    });
});
