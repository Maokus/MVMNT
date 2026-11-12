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

function clipboardHandlers() {
    const handlers = {
        copy: vi.fn(),
        paste: vi.fn(),
        pasteWithoutAutomation: vi.fn(),
        duplicateWithoutAutomation: vi.fn(),
    };
    for (const [key, run] of Object.entries(handlers)) {
        registerCommandHandler(SCENE_COMMANDS[key as keyof typeof handlers], {
            run,
            getState: () => ({ enabled: true }),
        });
    }
    return handlers;
}

describe('scene clipboard shortcuts', () => {
    it.each(['ctrlKey', 'metaKey'] as const)('routes Copy and both Paste variants using %s', (modifier) => {
        const handlers = clipboardHandlers();
        render(<Harness />);
        activateCommandSurface('scene-tree');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', [modifier]: true, bubbles: true }));
        expect(handlers.copy).toHaveBeenCalledOnce();
        // Paste must work after selection has been cleared.
        useSelectionStore.getState().clearSelection();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', [modifier]: true, bubbles: true }));
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'V', [modifier]: true, shiftKey: true, bubbles: true })
        );
        expect(handlers.paste).toHaveBeenCalledOnce();
        expect(handlers.pasteWithoutAutomation).toHaveBeenCalledOnce();
    });

    it.each(['timeline-clips', 'timeline-automation', 'properties'] as const)(
        'leaves clipboard keys to %s',
        (surface) => {
            const handlers = clipboardHandlers();
            render(<Harness />);
            activateCommandSurface(surface);
            for (const key of ['c', 'v', 'V']) {
                window.dispatchEvent(
                    new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey: key === 'V', bubbles: true })
                );
            }
            expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
        }
    );

    it('keeps text editing native and does not assign Shift+D', () => {
        const handlers = clipboardHandlers();
        render(<Harness />);
        activateCommandSurface('preview');
        const input = document.createElement('textarea');
        document.body.append(input);
        try {
            const paste = new KeyboardEvent('keydown', {
                key: 'V',
                ctrlKey: true,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            });
            input.dispatchEvent(paste);
            expect(paste.defaultPrevented).toBe(false);
            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true })
            );
            expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
        } finally {
            input.remove();
        }
    });
});
