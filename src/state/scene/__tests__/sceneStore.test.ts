import { describe, it, expect, beforeEach } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';
import type { SceneClipboard } from '@state/sceneStore';
import type { FontAsset } from '@state/scene/fonts';
import { createSceneSelectors } from '@state/scene/selectors';

type Store = ReturnType<typeof createSceneStore>;

describe('sceneStore', () => {
    let store: Store;

    beforeEach(() => {
        store = createSceneStore();
    });

    const importFixture = () => {
        store.getState().importScene(fixture as any);
    };

    it('round-trips import/export for the baseline regression fixture', () => {
        importFixture();
        const exported = store.getState().exportSceneDraft();

        expect(exported.sceneSettings).toEqual(fixture.sceneSettings);
        expect(exported.elements).toEqual(fixture.elements);
        expect(exported.macros).toEqual(fixture.macros);
    });

    it('maintains macro assignment index when bindings change', () => {
        importFixture();

        expect(store.getState().bindings.byMacro['macro.color.primary']).toEqual([
            { elementId: 'title', propertyPath: 'color' },
        ]);

        store.getState().updateBindings('title', { color: { type: 'constant', value: '#ffffff' } });

        expect(store.getState().bindings.byMacro['macro.color.primary']).toBeUndefined();

        store.getState().updateBindings('title', { color: { type: 'macro', macroId: 'macro.color.primary' } });

        expect(store.getState().bindings.byMacro['macro.color.primary']).toEqual([
            { elementId: 'title', propertyPath: 'color' },
        ]);
    });

    it('duplicates elements with bindings and updates order', () => {
        importFixture();

        store.getState().duplicateElement('title', 'titleCopy');

        const state = store.getState();
        expect(state.order).toEqual(['title', 'titleCopy', 'background']);
        expect(state.bindings.byMacro['macro.color.primary']).toEqual([
            { elementId: 'title', propertyPath: 'color' },
            { elementId: 'titleCopy', propertyPath: 'color' },
        ]);
    });

    it('moves elements without mutating memoized selectors', () => {
        importFixture();
        const selectors = createSceneSelectors();

        const beforeMove = selectors.selectOrderedElements(store.getState());
        store.getState().moveElement('background', 0);
        const afterMove = selectors.selectOrderedElements(store.getState());

        expect(store.getState().order[0]).toBe('background');
        expect(afterMove).not.toBe(beforeMove);
        expect(afterMove[0].id).toBe('background');
    });

    it('reorders elements when zIndex bindings change', () => {
        importFixture();

        const initialOrder = store.getState().order;
        expect(initialOrder).toEqual(['title', 'background']);

        store.getState().updateBindings('background', { zIndex: { type: 'constant', value: 10 } });

        const state = store.getState();
        expect(state.order).toEqual(['background', 'title']);
        expect(state.bindings.byElement.background.zIndex).toEqual({ type: 'constant', value: 10 });
    });

    it('assigns sequential zIndex values when elements are moved', () => {
        importFixture();

        store.getState().moveElement('background', 0);

        const state = store.getState();
        expect(state.order).toEqual(['background', 'title']);

        const backgroundZ = state.bindings.byElement.background?.zIndex;
        const titleZ = state.bindings.byElement.title?.zIndex;

        expect(backgroundZ).toEqual({ type: 'constant', value: 1 });
        expect(titleZ).toEqual({ type: 'constant', value: 0 });
    });

    it('keeps memoized selector references stable for unrelated updates', () => {
        importFixture();
        const selectors = createSceneSelectors();

        const initial = selectors.selectOrderedElements(store.getState());
        store.getState().updateSettings({ width: 2048 });
        const afterSettings = selectors.selectOrderedElements(store.getState());

        expect(afterSettings).toBe(initial);

        const macroInitial = selectors.selectMacroAssignments(store.getState());
        store.getState().updateSettings({ height: 1024 });
        const macroAfter = selectors.selectMacroAssignments(store.getState());
        expect(macroAfter).toBe(macroInitial);
    });

    it('updates interaction state with normalized selection and guards missing elements', () => {
        importFixture();

        store.getState().setInteractionState({
            selectedElementIds: ['title', 'missing', 'title', 'background'],
        });

        expect(store.getState().interaction.selectedElementIds).toEqual(['title', 'background']);

        store.getState().setInteractionState({ hoveredElementId: 'background' });
        expect(store.getState().interaction.hoveredElementId).toBe('background');

        store.getState().setInteractionState({ hoveredElementId: 'does-not-exist' });
        expect(store.getState().interaction.hoveredElementId).toBeNull();

        store.getState().setInteractionState({ editingElementId: 'background' });
        expect(store.getState().interaction.editingElementId).toBe('background');

        store.getState().setInteractionState({ editingElementId: 'missing' });
        expect(store.getState().interaction.editingElementId).toBeNull();
    });

    it('updates and clears clipboard interaction state', () => {
        const payload: SceneClipboard = { exportedAt: 123, elementIds: ['foo'] };
        store.getState().setInteractionState({ clipboard: payload });

        expect(store.getState().interaction.clipboard).toEqual(payload);

        store.getState().setInteractionState({ clipboard: null });
        expect(store.getState().interaction.clipboard).toBeNull();
    });

    it('creates, updates, and deletes macros while maintaining bindings', () => {
        importFixture();

        store.getState().createMacro('macro.test.dynamic', { type: 'number', value: 5, options: { min: 0, max: 10 } });
        expect(store.getState().macros.byId['macro.test.dynamic']).toMatchObject({ value: 5, type: 'number' });

        store.getState().updateMacroValue('macro.test.dynamic', 7);
        expect(store.getState().macros.byId['macro.test.dynamic']?.value).toBe(7);

        store.getState().deleteMacro('macro.color.primary');
        const state = store.getState();
        expect(state.macros.byId['macro.color.primary']).toBeUndefined();
        expect(state.bindings.byMacro['macro.color.primary']).toBeUndefined();
        expect(state.bindings.byElement['title'].color).toEqual({ type: 'constant', value: '#ff3366' });
    });

    it('renames macros and updates binding references', () => {
        importFixture();

        const initialState = store.getState();
        expect(initialState.macros.byId['macro.color.primary']).toBeDefined();
        expect(initialState.bindings.byElement['title'].color).toEqual({
            type: 'macro',
            macroId: 'macro.color.primary',
        });

        store.getState().renameMacro('macro.color.primary', 'macro.color.accent');

        const state = store.getState();
        expect(state.macros.byId['macro.color.primary']).toBeUndefined();
        expect(state.macros.byId['macro.color.accent']).toMatchObject({ name: 'macro.color.accent' });
        expect(state.bindings.byElement['title'].color).toEqual({
            type: 'macro',
            macroId: 'macro.color.accent',
        });
        expect(state.bindings.byMacro['macro.color.accent']).toEqual([
            { elementId: 'title', propertyPath: 'color' },
        ]);
    });

    it('keeps macro exportedAt stable across draft exports without mutations', () => {
        store.getState().createMacro('macro.stability', { type: 'number', value: 1 });

        const firstExport = store.getState().exportSceneDraft();
        const secondExport = store.getState().exportSceneDraft();

        expect(firstExport.macros?.exportedAt).toBeDefined();
        expect(secondExport.macros?.exportedAt).toBe(firstExport.macros?.exportedAt);
    });

    it('persists audio feature bindings through export drafts', () => {
        store.getState().addElement({
            id: 'audio-element',
            type: 'audioSpectrum',
            index: 0,
            bindings: {
                featureBinding: {
                    type: 'audioFeature',
                    trackId: 'audio-track',
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                    channelIndex: null,
                    smoothing: null,
                },
            },
        });

        const elementBindings = store.getState().bindings.byElement['audio-element'];
        expect(elementBindings.featureBinding).toEqual({
            type: 'audioFeature',
            trackId: 'audio-track',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });

        const exported = store.getState().exportSceneDraft();
        const serialized = exported.elements.find((el) => el.id === 'audio-element');
        expect(serialized).toBeDefined();
        expect((serialized as any).featureBinding).toEqual({
            type: 'audioFeature',
            trackId: 'audio-track',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
        });
    });

    it('registers, updates, and deletes font assets', () => {
        const asset: FontAsset = {
            id: 'font-1',
            family: 'Custom Family',
            originalFileName: 'Custom.ttf',
            fileSize: 1024,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            licensingAcknowledged: true,
            variants: [
                { id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' },
            ],
        };

        store.getState().registerFontAsset(asset);
        expect(store.getState().fonts.assets[asset.id]?.family).toBe('Custom Family');

        store.getState().updateFontAsset(asset.id, { family: 'Updated Family' });
        expect(store.getState().fonts.assets[asset.id]?.family).toBe('Updated Family');

        store.getState().deleteFontAsset(asset.id);
        expect(store.getState().fonts.assets[asset.id]).toBeUndefined();
    });

    it('imports and exports font asset metadata', () => {
        const asset: FontAsset = {
            id: 'font-2',
            family: 'Scene Font',
            originalFileName: 'SceneFont.otf',
            fileSize: 2048,
            createdAt: 123,
            updatedAt: 456,
            licensingAcknowledged: true,
            variants: [
                { id: 'italic', weight: 400, style: 'italic', sourceFormat: 'otf' },
            ],
        };

        store.getState().importScene({
            elements: [],
            fontAssets: { [asset.id]: asset },
            fontLicensingAcknowledgedAt: 789,
        });

        expect(store.getState().fonts.assets[asset.id]?.family).toBe('Scene Font');
        expect(store.getState().fonts.licensingAcknowledgedAt).toBe(789);

        const exported = store.getState().exportSceneDraft();
        expect(exported.fontAssets?.[asset.id]?.family).toBe('Scene Font');
        expect(exported.fontLicensingAcknowledgedAt).toBe(789);
    });
});
