import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fixture from '@persistence/__fixtures__/baseline/scene.edge-macros.json';
import { createSceneSnapshot, createSceneStore } from '@state/sceneStore';
import { createFlatSceneGraph, deriveElementOrder } from '@state/scene-graph';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import type { FontAsset } from '@state/scene/fonts';
import { createSceneSelectors } from '@state/scene/selectors';
import audioMacroFixture from '@persistence/__fixtures__/baseline/scene.audio-feature-macro.json';
import { createKeyframe, elementPropertyTarget } from '@automation/types';

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

    it('round-trips every persistent scene slice through the canonical snapshot', () => {
        importFixture();
        const font: FontAsset = {
            id: 'contract-font',
            family: 'Contract Family',
            originalFileName: 'contract.ttf',
            fileSize: 128,
            createdAt: 1,
            updatedAt: 2,
            licensingAcknowledged: true,
            variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
        };
        store.getState().registerFontAsset(font);
        store.getState().acknowledgeFontLicensing(42);
        const elementId = Object.keys(store.getState().elements)[0]!;
        store.getState().setAutomationChannel({
            id: 'contract-channel',
            target: elementPropertyTarget(elementId, 'opacity'),
            valueType: 'number',
            keyframes: [createKeyframe(0, 1)],
        });

        const snapshot = createSceneSnapshot(store.getState());
        const restored = createSceneStore();
        restored.getState().importScene(snapshot);
        const roundTrip = createSceneSnapshot(restored.getState());

        expect(roundTrip.elements).toEqual(snapshot.elements);
        expect(roundTrip.graph).toEqual(snapshot.graph);
        expect(roundTrip.sceneSettings).toEqual(snapshot.sceneSettings);
        expect(roundTrip.macros).toEqual(snapshot.macros);
        expect(roundTrip.fontAssets).toEqual(snapshot.fontAssets);
        expect(roundTrip.fontLicensingAcknowledgedAt).toBe(42);
        expect(roundTrip.automation).toEqual(snapshot.automation);
        expect(roundTrip.nodeBindings).toEqual(snapshot.nodeBindings);
    });

    it('migrates imported element offsets into host node position', () => {
        store.getState().importScene({
            elements: {
                legacy: {
                    id: 'legacy',
                    type: 'textOverlay',
                    properties: {
                        offsetX: { type: 'constant', value: 320 },
                        offsetY: { type: 'constant', value: 180 },
                        elementRotation: { type: 'constant', value: 90 },
                        anchorX: { type: 'constant', value: 0 },
                        anchorY: { type: 'constant', value: 0 },
                    },
                },
            },
            graph: createFlatSceneGraph(['legacy']),
        });

        const state = store.getState();
        const node = state.graph.nodesById[state.nodeIdByElementId.legacy];
        expect(node.userNodeTransform).toMatchObject({ translationX: 320, translationY: 180 });
        expect(node.userNodeTransform.rotation).toBeCloseTo(Math.PI / 2);
        expect(state.bindings.byElement.legacy.offsetX).toBeUndefined();
        expect(state.bindings.byElement.legacy.offsetY).toBeUndefined();
        expect(state.bindings.byElement.legacy.elementRotation).toBeUndefined();
        expect(state.bindings.byElement.legacy.anchorX).toBeUndefined();
        expect(state.bindings.byElement.legacy.anchorY).toBeUndefined();
    });

    it('repairs legacy element node labels during import', () => {
        const graph = createFlatSceneGraph(['legacy']);
        graph.nodesById['element:legacy'].name = 'legacy copy';

        store.getState().importScene({
            elements: { legacy: { id: 'legacy', type: 'textOverlay', properties: {} } },
            graph,
        });

        const exported = store.getState().exportSceneDraft();
        expect(store.getState().graph.nodesById['element:legacy'].name).toBe('legacy');
        expect(exported.graph.nodesById['element:legacy'].name).toBe('legacy');
    });

    it('moves legacy wrapper anchors into the shared content anchor', () => {
        store.getState().importScene({
            elements: {
                background: {
                    id: 'background',
                    type: 'shape',
                    properties: {
                        anchorX: { type: 'constant', value: 0 },
                        anchorY: { type: 'constant', value: 1 },
                    },
                },
            },
            graph: createFlatSceneGraph(['background']),
        });

        const state = store.getState();
        expect(state.bindings.byElement.background.contentAnchorX).toEqual({ type: 'constant', value: 0 });
        expect(state.bindings.byElement.background.contentAnchorY).toEqual({ type: 'constant', value: 1 });
        expect(state.bindings.byElement.background.anchorX).toBeUndefined();
        expect(state.bindings.byElement.background.anchorY).toBeUndefined();
    });

    it('moves text-only anchors into the shared content anchor', () => {
        store.getState().importScene({
            elements: {
                text: {
                    id: 'text',
                    type: 'textOverlay',
                    properties: {
                        anchorX: { type: 'constant', value: 0 },
                        anchorY: { type: 'constant', value: 1 },
                    },
                },
            },
            graph: createFlatSceneGraph(['text']),
        });

        const state = store.getState();
        expect(state.bindings.byElement.text.contentAnchorX).toEqual({ type: 'constant', value: 0 });
        expect(state.bindings.byElement.text.contentAnchorY).toEqual({ type: 'constant', value: 1 });
        expect(state.bindings.byElement.text.anchorX).toBeUndefined();
        expect(state.bindings.byElement.text.anchorY).toBeUndefined();
    });

    it('migrates element opacity and constant axis scales into the host node', () => {
        const graph = createFlatSceneGraph(['legacy']);
        const node = graph.nodesById['element:legacy'] as any;
        node.userNodeTransform.uniformScale = 2;
        delete node.userNodeTransform.scaleX;
        delete node.userNodeTransform.scaleY;
        delete node.localOpacity;
        store.getState().importScene({
            elements: {
                legacy: {
                    id: 'legacy',
                    type: 'textOverlay',
                    properties: {
                        elementOpacity: { type: 'constant', value: 0.4 },
                        elementScaleX: { type: 'constant', value: 1.5 },
                        elementScaleY: { type: 'constant', value: 0.5 },
                    },
                },
            },
            graph,
        });

        const state = store.getState();
        const migrated = state.graph.nodesById[state.nodeIdByElementId.legacy];
        expect(migrated.localOpacity).toBe(0.4);
        expect(migrated.userNodeTransform).toMatchObject({ scaleX: 3, scaleY: 1 });
        expect(state.bindings.byElement.legacy).not.toHaveProperty('elementOpacity');
        expect(state.bindings.byElement.legacy).not.toHaveProperty('elementScaleX');
        expect(state.bindings.byElement.legacy).not.toHaveProperty('elementScaleY');
    });

    it('preserves non-uniform node scaling while migrating constant element scales', () => {
        const graph = createFlatSceneGraph(['legacy']);
        const node = graph.nodesById['element:legacy'] as any;
        node.userNodeTransform = {
            ...node.userNodeTransform,
            translationX: 10,
            translationY: 20,
            scaleX: 2,
            scaleY: 3,
            pivotX: 100,
            pivotY: 200,
        };
        store.getState().importScene({
            elements: {
                legacy: {
                    id: 'legacy',
                    type: 'textOverlay',
                    properties: {
                        elementScaleX: { type: 'constant', value: 4 },
                        elementScaleY: { type: 'constant', value: 5 },
                    },
                },
            },
            graph,
        });

        const migrated = store.getState().graph.nodesById['element:legacy'];
        expect(migrated.userNodeTransform).toMatchObject({
            translationX: 610,
            translationY: 2420,
            scaleX: 8,
            scaleY: 15,
        });
    });

    it('maintains macro assignment index when bindings change', () => {
        importFixture();

        expect(store.getState().bindings.byMacro['macro.color.primary']).toEqual([
            { target: elementPropertyTarget('title', 'color') },
        ]);

        store.getState().updateBindings('title', { color: { type: 'constant', value: '#ffffff' } });

        expect(store.getState().bindings.byMacro['macro.color.primary']).toBeUndefined();

        store.getState().updateBindings('title', { color: { type: 'macro', macroId: 'macro.color.primary' } });

        expect(store.getState().bindings.byMacro['macro.color.primary']).toEqual([
            { target: elementPropertyTarget('title', 'color') },
        ]);
    });

    it('duplicates elements with bindings and updates order', () => {
        importFixture();

        store.getState().duplicateElement('title', 'titleCopy');

        const state = store.getState();
        expect(deriveElementOrder(state.graph)).toEqual(['title', 'titleCopy', 'background']);
        expect(state.bindings.byMacro['macro.color.primary']).toEqual([
            { target: elementPropertyTarget('title', 'color') },
            { target: elementPropertyTarget('titleCopy', 'color') },
        ]);
    });

    it('moves elements without mutating memoized selectors', () => {
        importFixture();
        const selectors = createSceneSelectors();

        const beforeMove = selectors.selectOrderedElements(store.getState());
        store.getState().moveElement('background', 0);
        const afterMove = selectors.selectOrderedElements(store.getState());

        expect(deriveElementOrder(store.getState().graph)[0]).toBe('background');
        expect(afterMove).not.toBe(beforeMove);
        expect(afterMove[0].id).toBe('background');
    });

    it('ignores retired zIndex bindings', () => {
        importFixture();

        const initialOrder = deriveElementOrder(store.getState().graph);
        expect(initialOrder).toEqual(['title', 'background']);

        store.getState().updateBindings('background', { zIndex: { type: 'constant', value: 10 } });

        const state = store.getState();
        expect(deriveElementOrder(state.graph)).toEqual(['title', 'background']);
        expect(state.bindings.byElement.background.zIndex).toBeUndefined();
    });

    it('uses graph child order without writing zIndex values', () => {
        importFixture();

        store.getState().moveElement('background', 0);

        const state = store.getState();
        expect(deriveElementOrder(state.graph)).toEqual(['background', 'title']);

        const backgroundZ = state.bindings.byElement.background?.zIndex;
        const titleZ = state.bindings.byElement.title?.zIndex;

        expect(backgroundZ).toBeUndefined();
        expect(titleZ).toBeUndefined();
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

        // Selection is now in selectionStore
        const state = store.getState();
        useSelectionStore
            .getState()
            .selectSceneNodes([state.nodeIdByElementId.title, state.nodeIdByElementId.background]);
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([
            state.nodeIdByElementId.title,
            state.nodeIdByElementId.background,
        ]);

        store.getState().setInteractionState({ hoveredElementId: 'background' });
        expect(store.getState().interaction.hoveredElementId).toBe('background');

        store.getState().setInteractionState({ hoveredElementId: 'does-not-exist' });
        expect(store.getState().interaction.hoveredElementId).toBeNull();

        store.getState().setInteractionState({ editingElementId: 'background' });
        expect(store.getState().interaction.editingElementId).toBe('background');

        store.getState().setInteractionState({ editingElementId: 'missing' });
        expect(store.getState().interaction.editingElementId).toBeNull();
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
            { target: elementPropertyTarget('title', 'color') },
        ]);
    });

    it('keeps macro exportedAt stable across draft exports without mutations', () => {
        store.getState().createMacro('macro.stability', { type: 'number', value: 1 });

        const firstExport = store.getState().exportSceneDraft();
        const secondExport = store.getState().exportSceneDraft();

        expect(firstExport.macros?.exportedAt).toBeDefined();
        expect(secondExport.macros?.exportedAt).toBe(firstExport.macros?.exportedAt);
    });

    it('persists audio feature track bindings through export drafts', () => {
        store.getState().addElement({
            id: 'audio-element',
            type: 'audioSpectrum',
            index: 0,
            bindings: {
                audioTrackId: { type: 'constant', value: 'audio-track' },
                features: {
                    type: 'constant',
                    value: [
                        {
                            featureKey: 'rms',
                            calculatorId: 'mvmnt.rms',
                            bandIndex: null,
                            smoothing: 0.15,
                        },
                    ],
                },
                analysisProfileId: { type: 'constant', value: 'default' },
            },
        });

        const elementBindings = store.getState().bindings.byElement['audio-element'];
        expect(elementBindings.audioTrackId).toEqual({ type: 'constant', value: 'audio-track' });
        expect(elementBindings.features).toEqual({
            type: 'constant',
            value: [
                {
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                },
            ],
        });
        expect(elementBindings.smoothing).toEqual({ type: 'constant', value: 0.15 });
        expect(elementBindings.analysisProfileId).toEqual({ type: 'constant', value: 'default' });

        const exported = store.getState().exportSceneDraft();
        const serialized = exported.elements['audio-element'];
        expect(serialized).toBeDefined();
        expect(serialized?.properties.audioTrackId).toEqual({ type: 'constant', value: 'audio-track' });
        expect(serialized?.properties.features).toEqual({
            type: 'constant',
            value: [
                {
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                },
            ],
        });
        expect(serialized?.properties.smoothing).toEqual({ type: 'constant', value: 0.15 });
        expect(serialized?.properties.analysisProfileId).toEqual({ type: 'constant', value: 'default' });
    });

    it('imports audio feature macro fixtures with track bindings intact', () => {
        store.getState().importScene(audioMacroFixture as any);

        const bindings = store.getState().bindings.byElement['spectrum'];
        expect(bindings?.audioTrackId).toEqual({ type: 'macro', macroId: 'macro.audio.track' });
        expect(bindings?.features?.type).toBe('constant');
        expect(bindings?.analysisProfileId?.type).toBe('constant');

        const macro = store.getState().macros.byId['macro.audio.track'];
        expect(macro?.options?.allowedTrackTypes).toEqual(['audio']);
        expect(macro?.value).toBe('audio-track-1');
    });

    it('ensures imported descriptor arrays gain a default analysis profile', () => {
        store.getState().importScene({
            elements: [
                {
                    id: 'audio-element',
                    type: 'audioSpectrum',
                    audioTrackId: { type: 'constant', value: 'audio-track-1' },
                    features: {
                        type: 'constant',
                        value: [
                            {
                                featureKey: 'waveform',
                                calculatorId: 'mvmnt.waveform',
                                bandIndex: null,
                            },
                        ],
                    },
                },
            ],
        } as any);

        const bindings = store.getState().bindings.byElement['audio-element'];
        expect(bindings?.analysisProfileId).toEqual({ type: 'constant', value: 'default' });
    });

    it('applies a default analysis profile when descriptor arrays are assigned', () => {
        store.getState().addElement({ id: 'audio-element', type: 'audioSpectrum' });

        store.getState().updateBindings('audio-element', {
            features: {
                type: 'constant',
                value: [
                    {
                        featureKey: 'rms',
                        calculatorId: 'mvmnt.rms',
                        bandIndex: null,
                        smoothing: 0.1,
                    },
                ],
            },
        });

        const bindings = store.getState().bindings.byElement['audio-element'];
        expect(bindings?.features).toEqual({
            type: 'constant',
            value: [
                {
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                },
            ],
        });
        expect(bindings?.smoothing).toEqual({ type: 'constant', value: 0.1 });
        expect(bindings?.analysisProfileId).toEqual({ type: 'constant', value: 'default' });
    });

    describe('timeline track macro validation', () => {
        beforeEach(() => {
            useTimelineStore.getState().resetTimeline();
            useTimelineStore.setState((state) => ({
                ...state,
                tracks: {
                    audioA: {
                        id: 'audioA',
                        name: 'Audio A',
                        type: 'audio',
                        enabled: true,
                        mute: false,
                        solo: false,
                        clips: [],
                        gain: 1,
                    },
                    audioB: {
                        id: 'audioB',
                        name: 'Audio B',
                        type: 'audio',
                        enabled: true,
                        mute: false,
                        solo: false,
                        clips: [],
                        gain: 1,
                    },
                    midiA: {
                        id: 'midiA',
                        name: 'MIDI A',
                        type: 'midi',
                        enabled: true,
                        mute: false,
                        solo: false,
                        offsetTicks: 0,
                    },
                },
                tracksOrder: ['audioA', 'audioB', 'midiA'],
            }));
        });

        afterEach(() => {
            useTimelineStore.getState().resetTimeline();
        });

        it('accepts audio track assignments when allowed', () => {
            store.getState().createMacro('macro.audio.track', {
                type: 'timelineTrackRef',
                value: 'audioA',
                options: { allowedTrackTypes: ['audio'] },
            });

            expect(store.getState().macros.byId['macro.audio.track']?.value).toBe('audioA');

            expect(() => store.getState().updateMacroValue('macro.audio.track', 'audioB')).not.toThrow();
            expect(store.getState().macros.byId['macro.audio.track']?.value).toBe('audioB');
        });

        it('rejects mismatched track types with descriptive errors', () => {
            store.getState().createMacro('macro.audio.track', {
                type: 'timelineTrackRef',
                value: 'audioA',
                options: { allowedTrackTypes: ['audio'] },
            });

            expect(() => store.getState().updateMacroValue('macro.audio.track', 'midiA')).toThrowError(
                /audio.*macro accepts audio tracks/i
            );
            expect(store.getState().macros.byId['macro.audio.track']?.value).toBe('audioA');
        });

        it('validates multi-track assignments when allowMultiple is set', () => {
            store.getState().createMacro('macro.audio.multi', {
                type: 'timelineTrackRef',
                value: ['audioA'],
                options: { allowedTrackTypes: ['audio'], allowMultiple: true },
            });

            expect(() => store.getState().updateMacroValue('macro.audio.multi', ['audioA', 'audioB'])).not.toThrow();

            expect(() => store.getState().updateMacroValue('macro.audio.multi', ['audioA', 'midiA'])).toThrowError(
                /macro accepts audio tracks/i
            );
        });
    });

    it('migrates legacy audio feature binding patches without polluting macro indices', () => {
        store.getState().addElement({
            id: 'osc',
            type: 'audioWaveform',
            index: deriveElementOrder(store.getState().graph).length,
        });

        store.getState().updateBindings('osc', {
            featureBinding: {
                type: 'audioFeature',
                trackId: 'track-1',
                featureKey: 'waveform',
                calculatorId: 'mvmnt.waveform',
                bandIndex: 1,
                channelIndex: 0,
                smoothing: 0.25,
            } as any,
        });

        const bindings = store.getState().bindings.byElement['osc'];
        expect(bindings.featureBinding).toBeUndefined();
        expect(bindings.audioTrackId).toEqual({ type: 'constant', value: 'track-1' });
        expect(bindings.features?.type).toBe('constant');
        const featureValues = (bindings.features as any)?.value as Array<Record<string, unknown>> | undefined;
        expect(featureValues).toBeDefined();
        expect(featureValues).toHaveLength(1);
        expect(featureValues?.[0]).toMatchObject({
            featureKey: 'waveform',
            calculatorId: 'mvmnt.waveform',
            bandIndex: 1,
            analysisProfileId: 'default',
            requestedAnalysisProfileId: 'default',
        });
        expect(bindings.smoothing).toEqual({ type: 'constant', value: 0.25 });
        expect(bindings.analysisProfileId).toEqual({ type: 'constant', value: 'default' });

        expect(store.getState().bindings.byMacro).not.toHaveProperty('undefined');
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
            variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'ttf' }],
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
            variants: [{ id: 'italic', weight: 400, style: 'italic', sourceFormat: 'otf' }],
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
