import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandContextMenu } from './CommandContextMenu';
import { defineCommand, registerCommandHandler, resetCommandsForTest } from '@context/commands/commandRegistry';
import { resetCommandOverlaysForTest } from '@context/commands/commandOverlay';

afterEach(() => {
    cleanup();
    resetCommandsForTest();
    resetCommandOverlaysForTest();
});

describe('CommandContextMenu', () => {
    it('shares command enablement and execution with keyboard-accessible menu items', () => {
        defineCommand({ id: 'test.run', title: 'Run command', category: 'Test', defaultShortcut: 'Mod+R' });
        const run = vi.fn();
        registerCommandHandler('test.run', { run, getState: () => ({ enabled: true }) });
        const onClose = vi.fn();
        render(
            <CommandContextMenu
                position={{ x: 10, y: 10 }}
                entries={[{ commandId: 'test.run' }, { label: 'Other', onSelect: vi.fn() }]}
                onClose={onClose}
            />
        );

        const first = screen.getByRole('menuitem', { name: /Run command/ });
        const second = screen.getByRole('menuitem', { name: 'Other' });
        expect(first).toHaveFocus();
        fireEvent.keyDown(first, { key: 'ArrowDown' });
        expect(second).toHaveFocus();
        fireEvent.keyDown(second, { key: 'ArrowUp' });
        expect(first).toHaveFocus();
        fireEvent.click(first);
        expect(run).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalled();
    });

    it('moves the highlight to the hovered item instead of keeping the first one lit', () => {
        const onClose = vi.fn();
        render(
            <CommandContextMenu
                position={{ x: 10, y: 10 }}
                entries={[
                    { label: 'First', onSelect: vi.fn() },
                    { label: 'Second', onSelect: vi.fn() },
                ]}
                onClose={onClose}
            />
        );

        const first = screen.getByRole('menuitem', { name: 'First' });
        const second = screen.getByRole('menuitem', { name: 'Second' });
        expect(first).toHaveFocus();

        fireEvent.pointerOver(second);
        expect(second).toHaveFocus();
        expect(first).not.toHaveFocus();

        fireEvent.pointerOver(first);
        expect(first).toHaveFocus();
        expect(second).not.toHaveFocus();
    });

    it('closes on Escape before global selection shortcuts can handle it', () => {
        const onClose = vi.fn();
        render(
            <CommandContextMenu
                position={{ x: 10, y: 10 }}
                entries={[{ label: 'Action', onSelect: vi.fn() }]}
                onClose={onClose}
            />
        );
        fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
