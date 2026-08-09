import { createEmptyAutomationState } from '@automation/types';
import { createFlatSceneGraph } from '@state/scene-graph';
import { describe, expect, it, vi } from 'vitest';
import { createAutomationMacrosSlice } from '../slices/automationMacrosSlice';
import { createElementsBindingsSlice } from '../slices/elementsBindingsSlice';
import { createGraphNodeBindingsSlice } from '../slices/graphNodeBindingsSlice';
import type { SceneStoreState } from '../storeTypes';

function capabilityFixture(): SceneStoreState {
    const action = vi.fn();
    return {
        settings: { fps: 60, width: 1920, height: 1080, tempo: 120, beatsPerBar: 4 },
        elements: {},
        graph: createFlatSceneGraph([]),
        nodeIdByElementId: {},
        elementIdByNodeId: {},
        bindings: { byElement: {}, byMacro: {} },
        macros: { byId: {}, allIds: [] },
        fonts: { assets: {}, order: [], totalBytes: 0 },
        interaction: {
            hoveredElementId: null,
            editingElementId: null,
            automationExpandedOwners: [],
            automationExpandedCurves: [],
            automationSearchQuery: '',
            expandedPropertyGroups: {},
            activePropertyTab: {},
            propertyClipboard: null,
        },
        runtimeMeta: {
            schemaVersion: 1,
            initializedAt: 0,
            persistentDirty: false,
            hasInitializedScene: false,
        },
        automation: createEmptyAutomationState(),
        nodeBindings: {},
        transientNodeTransforms: {},
        addElement: action,
        moveElement: action,
        duplicateElement: action,
        removeElement: action,
        updateElementId: action,
        updateSettings: action,
        updateBindings: action,
        updateNodeBindings: action,
        removeNodeBindings: action,
        createMacro: action,
        updateMacroValue: action,
        renameMacro: action,
        reorderMacros: action,
        deleteMacro: action,
        registerFontAsset: action,
        updateFontAsset: action,
        deleteFontAsset: action,
        acknowledgeFontLicensing: action,
        clearScene: action,
        importScene: action,
        exportSceneDraft: vi.fn(),
        replaceMacros: action,
        setInteractionState: action,
        setPropertyGroupCollapseState: action,
        setActivePropertyTab: action,
        setPropertyClipboard: action,
        setAutomationChannel: action,
        removeAutomationChannel: action,
        updateAutomationKeyframes: action,
        replaceGraph: action,
        updateNodeTransform: action,
        setTransientNodeTransform: action,
        clearTransientNodeTransforms: action,
        setNodeVisibility: action,
        setNodeOpacity: action,
        setNodeLocked: action,
        setNodeName: action,
    } as SceneStoreState;
}

describe('scene capability slice creators', () => {
    it('constructs element/binding capability without application wiring', () => {
        expect(Object.keys(createElementsBindingsSlice(capabilityFixture())).sort()).toEqual(
            [
                'settings',
                'elements',
                'bindings',
                'addElement',
                'moveElement',
                'duplicateElement',
                'removeElement',
                'updateElementId',
                'updateSettings',
                'updateBindings',
            ].sort()
        );
    });

    it('constructs graph/node-binding capability without application wiring', () => {
        const slice = createGraphNodeBindingsSlice(capabilityFixture());
        expect(slice.graph.rootId).toBeTruthy();
        expect(slice.updateNodeTransform).toBeTypeOf('function');
        expect(slice.updateNodeBindings).toBeTypeOf('function');
    });

    it('constructs automation/macro capability without application wiring', () => {
        const slice = createAutomationMacrosSlice(capabilityFixture());
        expect(slice.automation.channels).toEqual({});
        expect(slice.createMacro).toBeTypeOf('function');
        expect(slice.setAutomationChannel).toBeTypeOf('function');
    });
});
