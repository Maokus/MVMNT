import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneShortcuts } from './useSceneShortcuts';
import { activateCommandSurface } from '@context/commands/commandContext';
import { registerCommandHandler, resetCommandsForTest } from '@context/commands/commandRegistry';
import { SCENE_COMMANDS } from '@context/commands/sceneCommands';
import { resetGlobalShortcutsForTest } from './shortcutRegistry';
import { useSelectionStore } from '@state/selectionStore';

const runSceneCommand = vi.fn(() => true);
const deleteCommand = vi.fn();

function Harness() {
    useSceneShortcuts({
        selectedElementId: null,
        selectedBindings: {},
        deleteSelectedNodes: vi.fn(),
        groupSelectedNodes: vi.fn(),
        ungroupSelectedNodes: vi.fn(),
        updateElementConfig: vi.fn(),
        runSceneCommand,
    });
    return null;
}

beforeEach(() => {
    runSceneCommand.mockClear();
    deleteCommand.mockClear();
    useSelectionStore.getState().selectSceneNodes(['node:1'], 'node:1');
    registerCommandHandler(SCENE_COMMANDS.delete, {
        run: deleteCommand,
        getState: () => ({ enabled: true }),
    });
});

afterEach(() => {
    cleanup();
    useSelectionStore.getState().clearSelection();
    resetGlobalShortcutsForTest();
    resetCommandsForTest();
});

describe('scene shortcut context', () => {
    it('does not delete a retained scene selection while the automation editor is active', () => {
        render(<Harness />);
        activateCommandSurface('timeline-automation');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        expect(deleteCommand).not.toHaveBeenCalled();

        activateCommandSurface('preview');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        expect(deleteCommand).toHaveBeenCalledOnce();
    });

    it('reserves tree arrows for navigation and nudges only from the preview', () => {
        render(<Harness />);
        activateCommandSurface('scene-tree');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(runSceneCommand).not.toHaveBeenCalled();

        activateCommandSurface('preview');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(runSceneCommand).toHaveBeenCalledOnce();
    });
});
