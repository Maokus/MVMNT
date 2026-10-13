import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
