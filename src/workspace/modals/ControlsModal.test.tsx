import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGlobalShortcut, resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { ControlsModal } from './ControlsModal';

function Harness() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>controls</button>
            {open && <ControlsModal onClose={() => setOpen(false)} />}
        </>
    );
}

describe('ControlsModal', () => {
    afterEach(() => {
        cleanup();
        resetGlobalShortcutsForTest();
    });

    it('contains focus, blocks editor shortcuts, and restores focus on Escape', () => {
        const editor = vi.fn(() => true);
        const unregister = registerGlobalShortcut({
            id: 'test.editor',
            domain: 'scene',
            matches: (event) => event.key.toLowerCase() === 'a',
            handle: editor,
        });
        render(<Harness />);
        const opener = screen.getByRole('button', { name: 'controls' });
        opener.focus();
        fireEvent.click(opener);
        expect(screen.getByRole('dialog', { name: 'Controls' })).toBeInTheDocument();
        expect(screen.getByText('Fit canvas and visible artwork')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'a' });
        expect(editor).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Controls' })).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
        unregister();
    });

    it('focuses the dialog surface rather than the close button on open', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'controls' }));

        const dialog = screen.getByRole('dialog', { name: 'Controls' });
        await waitFor(() => expect(dialog).toHaveFocus());
        expect(screen.getByRole('button', { name: 'Close controls' })).not.toHaveFocus();
    });

    it('labels preview reset, scaling, and pane-specific shortcuts', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'controls' }));
        const dialog = screen.getByRole('dialog', { name: 'Controls' });
        expect(dialog).toHaveTextContent('Shift + 0');
        expect(dialog).toHaveTextContent('Alt + drag scale handle');
        expect(dialog).toHaveTextContent('Copy / paste / cut clips (clip pane)');
        expect(dialog).toHaveTextContent('Previous / next keyframe (automation pane)');
        expect(dialog).toHaveTextContent('Ctrl + Shift + D');
        expect(dialog).toHaveTextContent('Space');
        expect(dialog).not.toHaveTextContent('Space + drag');
    });
});
