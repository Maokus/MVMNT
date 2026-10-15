import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MacroConfig from '../MacroConfig';
import { useSceneStore } from '@state/sceneStore';
import { elementPropertyTarget } from '@automation/types';

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
const assignments = vi.hoisted(() => [] as Array<{ macroId: string; target: any }>);

vi.mock('@context/MacroContext', () => ({
    useMacros: () => ({
        macros,
        refresh: vi.fn(),
        ...macroActions,
    }),
}));

vi.mock('@state/scene', () => ({
    useMacroAssignments: () => assignments,
}));

describe('MacroConfig macro name editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        macros.splice(2);
        assignments.length = 0;
        vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        macroActions.rename.mockReturnValueOnce(false).mockReturnValueOnce(true);
    });

    it('shows inherited numeric limits in the macro editor', () => {
        macros.push({ name: 'Opacity', type: 'number', value: 0.5, options: {} } as any);
        assignments.push({ macroId: 'Opacity', target: elementPropertyTarget('first', 'opacity') });
        useSceneStore.setState({ elements: { first: { id: 'first', type: 'textOverlay' } } as any });

        render(<MacroConfig />);

        const input = screen.getByDisplayValue('0.5');
        expect(input).toHaveAttribute('min', '0');
        expect(input).toHaveAttribute('max', '1');
        expect(input).toHaveAttribute('step', '0.01');
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

    it('keeps the highlighted song title input outside the drag surface', () => {
        macros.push({ name: 'songTitle', type: 'string', value: 'Song Title', options: {} } as any);
        macroActions.updateValue.mockImplementation((name, value) => {
            const macro = macros.find((candidate) => candidate.name === name);
            if (macro) macro.value = value;
            return true;
        });
        const { rerender } = render(<MacroConfig />);

        const input = screen.getByRole('textbox', { name: 'songTitle' });
        expect(input).toHaveAttribute('data-tutorial-target', 'edit-title');
        expect(input.closest('[draggable="true"]')).toBeNull();
        expect(input.closest('.macro-item')?.querySelector('[title="Drag to reorder"]')).toHaveAttribute(
            'draggable',
            'true'
        );
        input.focus();
        expect(input).toHaveFocus();
        fireEvent.change(input, { target: { value: 'My Song' } });
        rerender(<MacroConfig />);
        expect(input).toHaveFocus();
        expect(input).toHaveValue('My Song');
        expect(macroActions.updateValue).toHaveBeenCalledWith('songTitle', 'My Song');
    });
});
