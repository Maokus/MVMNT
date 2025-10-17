import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen } from '@testing-library/react';
import PropertyGroupPanel from '../PropertyGroupPanel';
import type { PropertyDefinition, PropertyGroup } from '@core/types';

const assignListenerMock = vi.fn(() => () => {});

vi.mock('@context/MacroContext', () => ({
    useMacros: () => ({
        macros: [],
        create: vi.fn(),
        refresh: vi.fn(),
        updateValue: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        assignListener: assignListenerMock,
    }),
}));

describe('PropertyGroupPanel', () => {
    let consoleErrorSpy: MockInstance<Parameters<typeof console.error>, ReturnType<typeof console.error>>;

    beforeEach(() => {
        assignListenerMock.mockClear();
        consoleErrorSpy = vi.spyOn(console, 'error');
        consoleErrorSpy.mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('surfaces an error message when encountering an unsupported property type', () => {
        const unsupportedProperty = {
            key: 'legacyDescriptor',
            label: 'Legacy Descriptor',
            type: 'audioFeatureDescriptor',
        } as unknown as PropertyDefinition;

        const group: PropertyGroup = {
            id: 'legacy',
            label: 'Legacy',
            collapsed: false,
            properties: [unsupportedProperty],
        };

        render(
            <PropertyGroupPanel
                group={group}
                properties={group.properties}
                values={{}}
                macroAssignments={{}}
                onValueChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />,
        );

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Unsupported property/i);
        expect(alert).toHaveTextContent(/Legacy Descriptor/i);
        expect(alert).toHaveTextContent(/audioFeatureDescriptor/i);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[PropertyGroupPanel] Unsupported property type encountered',
            expect.objectContaining({ key: 'legacyDescriptor', type: 'audioFeatureDescriptor' }),
        );
    });
});
