import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneSelectionProvider } from '../SceneSelectionContext';
import { executeCommand, resetCommandsForTest } from '../commands/commandRegistry';
import { SCENE_COMMANDS } from '../commands/sceneCommands';
import { dispatchSceneCommand, type SceneCommand } from '@state/scene';
import { createSceneSnapshot, useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useSelectionStore } from '@state/selectionStore';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';
import { createPatchUndoController } from '@state/undo/patch-undo';
import SceneElementPanel from '@workspace/panels/scene-element/SceneElementPanel';
import AutomationTrackLabels from '@workspace/panels/timeline/automation/AutomationTrackLabels';
import AutomationLanes from '@workspace/panels/timeline/automation/AutomationLanes';
import { createKeyframe, elementPropertyTarget } from '@automation/types';

vi.mock('../VisualizerContext', () => ({ useVisualizer: () => ({ visualizer: null }) }));

function command(command: SceneCommand) {
    const result = dispatchSceneCommand(command);
    expect(result.success, result.error?.message).toBe(true);
    return result;
}

const legacyPreferenceKey = 'mvmnt.scene-view.open-groups-collapsed';
let previousPreference: string | null;
beforeEach(() => {
    previousPreference = localStorage.getItem(legacyPreferenceKey);
    useSceneStore.getState().clearScene();
    useSelectionStore.getState().clearSelection();
    command({ type: 'addElement', elementType: 'textOverlay', elementId: 'child' });
    const child = useSceneStore.getState().nodeIdByElementId.child;
    command({ type: 'groupNodes', nodeIds: [child], groupId: 'inner', name: 'Inner' });
    command({ type: 'groupNodes', nodeIds: ['inner'], groupId: 'outer', name: 'Outer' });
    command({
        type: 'enablePropertyAutomation',
        target: elementPropertyTarget('child', 'fontSize'),
        valueType: 'number',
        initialKeyframes: [createKeyframe(0, 20)],
    });
    render(
        <SceneSelectionProvider>
            <SceneElementPanel />
            <AutomationTrackLabels />
            <AutomationLanes width={600} />
        </SceneSelectionProvider>
    );
});
afterEach(() => {
    cleanup();
    resetCommandsForTest();
    useSceneStore.getState().clearScene();
    useSelectionStore.getState().clearSelection();
    if (previousPreference === null) localStorage.removeItem(legacyPreferenceKey);
    else localStorage.setItem(legacyPreferenceKey, previousPreference);
});

describe('group view controls', () => {
    it('collapses every nested group in both editors without changing selection, document, or undo', () => {
        const child = useSceneStore.getState().nodeIdByElementId.child;
        act(() => useSelectionStore.getState().selectSceneNodes([child], child));
        const snapshot = createSceneSnapshot(useSceneStore.getState());
        const revision = useDocumentRevisionStore.getState().revision;
        const undo = createPatchUndoController(null);
        try {
            expect(document.querySelector('[data-scene-node-id="element:child"]')).toBeInTheDocument();
            fireEvent.click(screen.getAllByRole('button', { name: 'Group view options' })[0]);
            fireEvent.click(screen.getByRole('menuitem', { name: 'Collapse All Groups' }));
            expect(useSelectionStore.getState().expandedNodeIds).toMatchObject({ outer: false, inner: false });
            expect(useSelectionStore.getState().selectedNodeIds).toEqual([child]);
            expect(screen.getAllByRole('treeitem')).toHaveLength(1);
            expect(document.querySelector('[data-scene-node-id="element:child"]')).not.toBeInTheDocument();
            expect(createSceneSnapshot(useSceneStore.getState())).toEqual(snapshot);
            expect(useDocumentRevisionStore.getState().revision).toBe(revision);
            expect(undo.canUndo()).toBe(false);
            // The automation header exposes the same commands.
            fireEvent.click(screen.getAllByRole('button', { name: 'Group view options' })[1]);
            fireEvent.click(screen.getByRole('menuitem', { name: 'Expand All Groups' }));
            expect(screen.getAllByRole('treeitem')).toHaveLength(3);
            expect(document.querySelector('[data-scene-node-id="element:child"]')).toBeInTheDocument();
            expect(useSelectionStore.getState().selectedNodeIds).toEqual([child]);
            expect(undo.canUndo()).toBe(false);
        } finally {
            undo.dispose();
        }
    });

    it('clears filtering when collapsing so hidden descendants stay unmounted', () => {
        act(() => useSceneEditorStore.getState().setAutomationSearchQuery('font'));
        act(() => expect(executeCommand(SCENE_COMMANDS.collapseAllGroups)).toBe(true));
        expect(useSceneEditorStore.getState().automationSearchQuery).toBe('');
        expect(document.querySelector('[data-scene-node-id="element:child"]')).not.toBeInTheDocument();
    });

    it('only exposes manual collapse and expand commands in both group view menus', () => {
        for (const button of screen.getAllByRole('button', { name: 'Group view options' })) {
            fireEvent.click(button);
            expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
                'Collapse All Groups',
                'Expand All Groups',
            ]);
            expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('menuitem', { name: 'Expand All Groups' }));
        }
    });

    it('collapses groups on every project import despite a previously disabled preference', () => {
        localStorage.setItem(legacyPreferenceKey, 'false');
        const snapshot = createSceneSnapshot(useSceneStore.getState());
        act(() => useSelectionStore.getState().setNodesExpanded(['obsolete'], false));
        act(() => useSceneStore.getState().importScene(snapshot));
        expect(useSelectionStore.getState().expandedNodeIds).toEqual({ outer: false, inner: false });
        expect(screen.getAllByRole('treeitem')).toHaveLength(1);
        expect(document.querySelector('[data-scene-node-id="element:child"]')).not.toBeInTheDocument();
        act(() => expect(executeCommand(SCENE_COMMANDS.expandAllGroups)).toBe(true));
        expect(useSelectionStore.getState().expandedNodeIds).toEqual({ outer: true, inner: true });
        act(() => useSceneStore.getState().importScene(snapshot));
        expect(useSelectionStore.getState().expandedNodeIds).toEqual({ outer: false, inner: false });
    });

    it('preserves manual folding through edits and undo snapshot restoration', () => {
        act(() => expect(executeCommand(SCENE_COMMANDS.collapseAllGroups)).toBe(true));
        const undo = createPatchUndoController(null);
        try {
            act(() => command({ type: 'addElement', elementType: 'textOverlay', elementId: 'new' }));
            act(() => undo.undo());
            expect(useSelectionStore.getState().expandedNodeIds).toMatchObject({ outer: false, inner: false });
            expect(useSceneStore.getState().elements.new).toBeUndefined();
        } finally {
            undo.dispose();
        }
    });
});
