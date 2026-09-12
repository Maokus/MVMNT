import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MacroConfig from '../MacroConfig';

const macroActions = vi.hoisted(() => ({
    create: vi.fn(),
    updateValue: vi.fn(),
    rename: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    assignListener: vi.fn(() => () => undefined),
}));
const macros = vi.hoisted(() => [
    { name: 'first', type: 'number' as const, value: 1, options: {} },
    { name: 'second', type: 'number' as const, value: 2, options: {} },
]);

vi.mock('@context/MacroContext', () => ({
    useMacros: () => ({
        macros,
        refresh: vi.fn(),
        ...macroActions,
    }),
}));

vi.mock('@state/scene', () => ({
    useMacroAssignments: () => [],
}));

describe('MacroConfig macro name editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        macroActions.rename.mockReturnValueOnce(false).mockReturnValueOnce(true);
    });

    it('keeps the rename input editable after a duplicate name is rejected', () => {
        render(<MacroConfig />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Edit macro name' })[1]);
        const input = screen.getByRole('textbox', { name: 'Macro name' });
        fireEvent.change(input, { target: { value: 'first' } });
        fireEvent.blur(input);

        expect(macroActions.rename).toHaveBeenCalledWith('second', 'first');
        expect(window.alert).toHaveBeenCalledWith('Failed to rename macro. Name might already exist.');
        expect(input).toHaveValue('first');

        fireEvent.change(input, { target: { value: 'renamed-second' } });
        expect(input).toHaveValue('renamed-second');
        fireEvent.blur(input);

        expect(macroActions.rename).toHaveBeenLastCalledWith('second', 'renamed-second');
        expect(screen.queryByRole('textbox', { name: 'Macro name' })).not.toBeInTheDocument();
    });
});
