import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { ModalShell } from '../ModalShell';

describe('ModalShell', () => {
    afterEach(() => {
        cleanup();
        resetGlobalShortcutsForTest();
    });

    it('renders dialog with label and children', () => {
        render(
            <ModalShell shortcutId="modal.test.shell" label="Test dialog" onCancel={() => {}}>
                <span>body text</span>
            </ModalShell>
        );
        expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
        expect(screen.getByText('body text')).toBeInTheDocument();
    });

    it('backdrop click cancels but card click does not', () => {
        const onCancel = vi.fn();
        const { container } = render(
            <ModalShell shortcutId="modal.test.shell-click" label="Click dialog" onCancel={onCancel}>
                <span>inner</span>
            </ModalShell>
        );
        const backdrop = container.querySelector('.bg-black') ?? container.firstElementChild?.firstElementChild;
        expect(backdrop).toBeTruthy();
        if (backdrop) fireEvent.click(backdrop);
        expect(onCancel).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('inner'));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('Escape cancels via the modal shortcut domain', () => {
        const onCancel = vi.fn();
        render(
            <ModalShell shortcutId="modal.test.shell-escape" label="Escape dialog" onCancel={onCancel}>
                <span>inner</span>
            </ModalShell>
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
