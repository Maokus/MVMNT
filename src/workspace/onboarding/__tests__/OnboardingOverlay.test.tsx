import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGlobalShortcut, resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { OnboardingOverlay } from '@workspace/overlays/OnboardingOverlay';

const props = () => ({ onClose: vi.fn(), onStart: vi.fn(), busy: false, error: '', restarting: false });
afterEach(() => {
    cleanup();
    resetGlobalShortcutsForTest();
});

describe('welcome dialog', () => {
    it('offers a demo explicitly without starting it on mount', async () => {
        const callbacks = props();
        render(
            <MemoryRouter>
                <OnboardingOverlay {...callbacks} />
            </MemoryRouter>
        );
        expect(screen.getByRole('dialog', { name: 'Make music move' })).toBeVisible();
        expect(callbacks.onStart).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Try the demo' })).toHaveFocus());
        userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));
        expect(callbacks.onStart).toHaveBeenCalledOnce();
        expect(screen.getByRole('link', { name: 'Join the Discord' })).toHaveAttribute(
            'href',
            'https://maok.us/discord'
        );
    });

    it('contains focus and claims editor shortcuts while preserving button keys', async () => {
        const workspaceCommand = vi.fn();
        registerGlobalShortcut({
            id: 'test.workspace',
            domain: 'document',
            matches: () => true,
            handle: workspaceCommand,
        });
        const callbacks = props();
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();
        const { unmount } = render(
            <MemoryRouter>
                <OnboardingOverlay {...callbacks} />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByRole('button', { name: 'Try the demo' })).toHaveFocus());
        userEvent.tab({ shift: true });
        await waitFor(() => expect(screen.getByRole('link', { name: 'Join the Discord' })).toHaveFocus());
        userEvent.tab();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Try the demo' })).toHaveFocus());
        fireEvent.keyDown(document.activeElement!, { key: 's', ctrlKey: true });
        fireEvent.keyDown(document.activeElement!, { key: ' ' });
        expect(workspaceCommand).not.toHaveBeenCalled();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(callbacks.onClose).toHaveBeenCalledOnce();
        unmount();
        await waitFor(() => expect(trigger).toHaveFocus());
        trigger.remove();
    });

    it('blocks repeated actions during loading and announces errors', () => {
        const callbacks = props();
        const { rerender } = render(
            <MemoryRouter>
                <OnboardingOverlay {...callbacks} busy />
            </MemoryRouter>
        );
        expect(screen.getByRole('button', { name: 'Loading demo…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Continue with this project' })).toBeDisabled();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(callbacks.onClose).not.toHaveBeenCalled();
        rerender(
            <MemoryRouter>
                <OnboardingOverlay {...callbacks} error="Could not load demo" />
            </MemoryRouter>
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load demo');
        userEvent.click(screen.getByRole('button', { name: 'Continue with this project' }));
        expect(callbacks.onClose).toHaveBeenCalledOnce();
    });
});
