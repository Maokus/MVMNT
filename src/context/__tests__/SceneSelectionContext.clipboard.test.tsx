import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SceneElementPanel from '@workspace/panels/scene-element/SceneElementPanel';
import { SceneSelectionProvider } from '../SceneSelectionContext';
import { executeCommand, getCommandState, resetCommandsForTest } from '../commands/commandRegistry';
import { SCENE_COMMANDS } from '../commands/sceneCommands';
import { useSceneStore, createSceneSnapshot } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';
import { dispatchSceneCommand, type SceneCommand } from '@state/scene';
import { createKeyframe, elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import { createPatchUndoController } from '@state/undo/patch-undo';

vi.mock('../VisualizerContext', () => ({ useVisualizer: () => ({ visualizer: null }) }));

function command(command: SceneCommand) {
    const result = dispatchSceneCommand(command);
    expect(result.success, result.error?.message).toBe(true);
    return result;
}

function execute(id: string) {
    act(() => {
        expect(executeCommand(id)).toBe(true);
    });
}

function select(ids: string[]) {
    act(() => useSelectionStore.getState().selectSceneNodes(ids, ids.at(-1) ?? null));
}

function copiedElements() {
    return Object.keys(useSceneStore.getState().elements).filter((id) => !['first', 'second'].includes(id));
}

beforeEach(() => {
    useSceneStore.getState().clearScene();
    useTimelineStore.getState().resetTimeline();
    useSelectionStore.getState().clearSelection();
    command({ type: 'addElement', elementType: 'textOverlay', elementId: 'first', config: { text: 'Original' } });
    command({
        type: 'addElement',
        elementType: 'notesPlayingDisplay',
        elementId: 'second',
        config: { midiTrackId: 'midi-one' },
    });
    const nodes = useSceneStore.getState().nodeIdByElementId;
    command({ type: 'groupNodes', nodeIds: [nodes.first], groupId: 'inner' });
    command({ type: 'groupNodes', nodeIds: ['inner', nodes.second], groupId: 'outer' });
    command({ type: 'createMacro', macroId: 'shared', definition: { type: 'number', value: 3 } });
    command({
        type: 'updatePropertyTargetBinding',
        target: elementPropertyTarget('first', 'lineSpacing'),
        binding: { type: 'macro', macroId: 'shared' },
    });
    for (const target of [
        elementPropertyTarget('first', 'fontSize'),
        nodePropertyTarget('inner', 'translationX'),
        nodePropertyTarget('outer', 'rotation'),
    ]) {
        command({
            type: 'enablePropertyAutomation',
            target,
            valueType: 'number',
            initialKeyframes: [
                createKeyframe(0, 0, { mode: 'linear', direction: 'auto' }),
                createKeyframe(100, 100, { mode: 'linear', direction: 'auto' }),
            ],
        });
    }
    useTimelineStore.getState().setCurrentTick(25, 'user');
    render(
        <SceneSelectionProvider>
            <SceneElementPanel />
        </SceneSelectionProvider>
    );
});

afterEach(() => {
    cleanup();
    resetCommandsForTest();
    useSceneStore.getState().clearScene();
    useSelectionStore.getState().clearSelection();
});

describe('scene clipboard commands', () => {
    it('offers clipboard actions in context menus and preserves a right-clicked selection', () => {
        select(['inner', useSceneStore.getState().nodeIdByElementId.second]);
        const selected = [...useSelectionStore.getState().selectedNodeIds];
        act(() =>
            useSelectionStore
                .getState()
                .selectKeyframes([{ channelId: Object.keys(useSceneStore.getState().automation.channels)[0], tick: 0 }])
        );
        const row = screen
            .getAllByRole('treeitem')
            .find((row) => row.textContent?.includes('second') && row.getAttribute('aria-expanded') === null)!;
        fireEvent.contextMenu(row);
        expect(useSelectionStore.getState().selectedNodeIds).toEqual(selected);
        expect(useSelectionStore.getState().activeTarget).toBe('elements');
        expect(screen.getByRole('menuitem', { name: /^Paste Without Automation/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));
        fireEvent.contextMenu(screen.getByRole('tree'));
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
        expect(screen.getByRole('menuitem', { name: /^Paste Without Automation/ })).toBeEnabled();
        fireEvent.click(screen.getByRole('menuitem', { name: /^Paste Without Automation/ }));
        expect(copiedElements()).toHaveLength(2);
    });

    it('can paste back into the scene after deleting all copied elements', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        execute(SCENE_COMMANDS.delete);
        expect(Object.keys(useSceneStore.getState().elements)).toHaveLength(0);
        fireEvent.contextMenu(screen.getByText('No elements in scene'));
        fireEvent.click(screen.getByRole('menuitem', { name: /^Paste Without Automation/ }));
        expect(Object.keys(useSceneStore.getState().elements)).toHaveLength(2);
        expect(useSelectionStore.getState().selectedNodeIds).toHaveLength(1);
    });

    it('deletes the right-clicked element from the context menu', () => {
        const second = screen
            .getAllByRole('treeitem')
            .find((row) => row.textContent?.includes('second') && row.getAttribute('aria-expanded') === null)!;
        fireEvent.contextMenu(second);
        const deleteItem = screen.getByRole('menuitem', { name: /^Delete/ });
        fireEvent.pointerEnter(deleteItem);
        fireEvent.pointerDown(deleteItem);
        fireEvent.pointerUp(deleteItem);
        fireEvent.click(deleteItem);
        expect(useSceneStore.getState().elements.second).toBeUndefined();
        expect(useSceneStore.getState().elements.first).toBeDefined();
    });

    it('right-clicking an unselected row makes it the clipboard target', () => {
        select(['inner']);
        const second = screen
            .getAllByRole('treeitem')
            .find((row) => row.textContent?.includes('second') && row.getAttribute('aria-expanded') === null)!;
        fireEvent.contextMenu(second);
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([
            useSceneStore.getState().nodeIdByElementId.second,
        ]);
        fireEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));
        expect(Object.keys(useSceneEditorStore.getState().sceneClipboard!.full.elements)).toEqual(['second']);
    });

    it('copies overlapping selections once without changing the document', () => {
        // The bundle normalizes even selections supplied by non-tree callers.
        select(['outer', 'inner', useSceneStore.getState().nodeIdByElementId.first]);
        const before = createSceneSnapshot(useSceneStore.getState());
        const revision = useDocumentRevisionStore.getState().revision;
        execute(SCENE_COMMANDS.copy);
        const clipboard = useSceneEditorStore.getState().sceneClipboard!;
        expect(clipboard.full.roots).toEqual(['outer']);
        expect(Object.keys(clipboard.full.elements)).toHaveLength(2);
        expect(createSceneSnapshot(useSceneStore.getState())).toEqual(before);
        expect(useDocumentRevisionStore.getState().revision).toBe(revision);
    });

    it('pastes a copy-time pose throughout nested groups while keeping macros and track references', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        const clipboard = useSceneEditorStore.getState().sceneClipboard;
        act(() => useTimelineStore.getState().setCurrentTick(90, 'user'));
        act(() => useTimelineStore.getState().setAutoKeying(true));
        // Change the source after Copy too: the clipboard remains a snapshot.
        act(() => command({ type: 'updateElementConfig', elementId: 'first', patch: { text: 'Changed' } }));
        act(() => command({ type: 'updateMacroValue', macroId: 'shared', value: 5 }));
        select([]);
        execute(SCENE_COMMANDS.pasteWithoutAutomation);

        const state = useSceneStore.getState();
        const [rootId] = useSelectionStore.getState().selectedNodeIds;
        expect(state.graph.nodesById[rootId]).toMatchObject({ kind: 'group', parentId: state.graph.rootId });
        const newFirst = copiedElements().find((id) => state.elements[id].type === 'textOverlay')!;
        const newSecond = copiedElements().find((id) => state.elements[id].type === 'notesPlayingDisplay')!;
        expect(state.bindings.byElement[newFirst]).toMatchObject({
            text: { type: 'constant', value: 'Original' },
            fontSize: { type: 'constant', value: 25 },
            lineSpacing: { type: 'macro', macroId: 'shared' },
        });
        expect(state.bindings.byElement[newSecond].midiTrackId).toEqual({ type: 'constant', value: 'midi-one' });
        expect(state.nodeBindings[rootId].rotation).toEqual({ type: 'constant', value: 25 });
        const newInner = Object.values(state.graph.nodesById).find(
            (node) => node.kind === 'group' && node.parentId === rootId
        )!;
        expect(state.nodeBindings[newInner.id].translationX).toEqual({ type: 'constant', value: 25 });
        expect(Object.keys(state.automation.channels)).toHaveLength(3); // Original owners only.
        expect(Object.keys(state.macros.byId)).toEqual(['shared']);
        expect(state.macros.byId.shared.value).toBe(5);
        expect(useSceneEditorStore.getState().sceneClipboard).toBe(clipboard);
    });

    it('keeps normal paste fully animated after a paste without automation, with independent channels', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        select([]);
        execute(SCENE_COMMANDS.pasteWithoutAutomation);
        select([]);
        execute(SCENE_COMMANDS.paste);
        const channels = Object.values(useSceneStore.getState().automation.channels);
        expect(channels).toHaveLength(6);
        const original = channels.find((channel) => channel.target.owner.id === 'first')!;
        const copied = channels.find(
            (channel) => channel.target.owner.kind === 'element' && channel.target.owner.id !== 'first'
        )!;
        expect(copied.id).not.toBe(original.id);
        expect(copied.keyframes).toEqual(original.keyframes);
        expect(copied.keyframes).not.toBe(original.keyframes);
        act(() => command({ type: 'updateKeyframe', channelId: copied.id, tick: 0, patch: { value: 900 } }));
        expect(useSceneStore.getState().automation.channels[original.id].keyframes[0].value).toBe(0);
    });

    it('pastes into groups, after elements, and at the root without a selection', () => {
        const source = useSceneStore.getState().nodeIdByElementId.first;
        select([source]);
        execute(SCENE_COMMANDS.copy);
        for (const anchor of ['inner', source, null]) {
            select(anchor ? [anchor] : []);
            execute(SCENE_COMMANDS.paste);
            const state = useSceneStore.getState();
            const [newId] = useSelectionStore.getState().selectedNodeIds;
            const parentId = anchor === null ? state.graph.rootId : 'inner';
            expect(state.graph.nodesById[newId].parentId).toBe(parentId);
            const parent = state.graph.nodesById[parentId];
            expect(
                'children' in parent &&
                    (anchor === source
                        ? parent.children[parent.children.indexOf(source) + 1] === newId
                        : parent.children.at(-1) === newId)
            ).toBe(true);
        }
    });

    it('duplicates the current pose next to the source without touching the clipboard', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        const clipboard = useSceneEditorStore.getState().sceneClipboard;
        act(() => useTimelineStore.getState().setCurrentTick(75, 'user'));
        execute(SCENE_COMMANDS.duplicateWithoutAutomation);
        const state = useSceneStore.getState();
        const [newId] = useSelectionStore.getState().selectedNodeIds;
        expect(state.graph.nodesById[newId].parentId).toBe(state.graph.rootId);
        expect(state.nodeBindings[newId].rotation).toEqual({ type: 'constant', value: 75 });
        const newFirst = copiedElements().find((id) => state.elements[id].type === 'textOverlay')!;
        expect(state.bindings.byElement[newFirst].fontSize).toEqual({ type: 'constant', value: 75 });
        expect(Object.keys(state.automation.channels)).toHaveLength(3);
        expect(useSceneEditorStore.getState().sceneClipboard).toBe(clipboard);
    });

    it.each([SCENE_COMMANDS.paste, SCENE_COMMANDS.pasteWithoutAutomation, SCENE_COMMANDS.duplicateWithoutAutomation])(
        'undoes and redoes %s as one action, retaining the clipboard',
        (id) => {
            select(['outer']);
            execute(SCENE_COMMANDS.copy);
            select([]);
            if (id === SCENE_COMMANDS.duplicateWithoutAutomation) select(['outer']);
            const clipboard = useSceneEditorStore.getState().sceneClipboard;
            const before = createSceneSnapshot(useSceneStore.getState());
            const undo = createPatchUndoController(null);
            try {
                execute(id);
                expect(copiedElements()).toHaveLength(2);
                act(() => undo.undo());
                expect(createSceneSnapshot(useSceneStore.getState())).toEqual(before);
                expect(undo.canUndo()).toBe(false);
                expect(useSceneEditorStore.getState().sceneClipboard).toBe(clipboard);
                act(() => undo.redo());
                expect(copiedElements()).toHaveLength(2);
                expect(useSceneEditorStore.getState().sceneClipboard).toBe(clipboard);
            } finally {
                undo.dispose();
            }
        }
    );

    it('clears the clipboard on project replacement and new blank scenes', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        const document = createSceneSnapshot(useSceneStore.getState());
        act(() => useSceneStore.getState().importScene(document));
        expect(useSceneEditorStore.getState().sceneClipboard).toBeNull();
        expect(getCommandState(SCENE_COMMANDS.paste).enabled).toBe(false);
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        act(() => command({ type: 'clearScene' }));
        expect(useSceneEditorStore.getState().sceneClipboard).toBeNull();
    });

    it('does not paste into a locked group', () => {
        select(['outer']);
        execute(SCENE_COMMANDS.copy);
        act(() => command({ type: 'setNodeLocked', nodeId: 'inner', locked: true }));
        // Retained/stale selections must not bypass destination locking.
        select(['inner']);
        expect(getCommandState(SCENE_COMMANDS.paste).enabled).toBe(false);
        expect(getCommandState(SCENE_COMMANDS.pasteWithoutAutomation).enabled).toBe(false);
    });
});
