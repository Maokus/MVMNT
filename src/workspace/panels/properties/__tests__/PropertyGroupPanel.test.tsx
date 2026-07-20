import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PropertyGroupPanel from '../PropertyGroupPanel';
import type { PropertyDefinition, PropertyGroup } from '@core/types';

const assignListenerMock = vi.fn(() => () => { });

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
        consoleErrorSpy.mockImplementation(() => { });
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
                elementId="test-element"
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

    it('renders the dedicated perspective controls and resets them atomically', () => {
        const properties = [
            { key: 'warpEnabled', label: 'Enable Perspective', type: 'boolean', default: false },
            { key: 'perspectiveRotationX', label: 'X Rotation', type: 'number', default: 0 },
            { key: 'perspectiveRotationY', label: 'Y Rotation', type: 'number', default: 0 },
            { key: 'perspectiveStrength', label: 'Perspective Strength', type: 'number', default: 50 },
            { key: 'perspectivePivotLinked', label: 'Use Element Anchor', type: 'boolean', default: true },
            { key: 'perspectivePivotX', label: '3D Pivot X', type: 'number', default: 0.5 },
            { key: 'perspectivePivotY', label: '3D Pivot Y', type: 'number', default: 0.5 },
            { key: 'perspectiveVanishingPointX', label: 'Vanishing Point X', type: 'number', default: 0.5 },
            { key: 'perspectiveVanishingPointY', label: 'Vanishing Point Y', type: 'number', default: 0.5 },
        ] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'perspective',
            label: 'Perspective',
            collapsed: false,
            control: 'perspective',
            properties,
        };
        const onValueChange = vi.fn();

        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{
                    warpEnabled: true,
                    perspectiveRotationX: 20,
                    perspectiveRotationY: -15,
                    perspectiveStrength: 75,
                    perspectivePivotLinked: true,
                    perspectivePivotX: 0.5,
                    perspectivePivotY: 0.5,
                    perspectiveVanishingPointX: 0.5,
                    perspectiveVanishingPointY: 0.5,
                }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={onValueChange}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />,
        );

        expect(screen.getByTitle(/Drag horizontally for Y tilt/i)).toBeInTheDocument();
        expect(screen.getByText('Advanced')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reset Perspective' }));
        expect(onValueChange).toHaveBeenCalledWith('perspectiveRotationX', 0, expect.objectContaining({
            linkedUpdates: expect.objectContaining({
                perspectiveRotationY: 0,
                perspectiveStrength: 50,
                perspectivePivotLinked: true,
            }),
        }));
    });
});
