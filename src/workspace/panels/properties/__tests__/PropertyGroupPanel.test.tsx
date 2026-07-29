import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
                elementId="test-element"
                onValueChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Unsupported property/i);
        expect(alert).toHaveTextContent(/Legacy Descriptor/i);
        expect(alert).toHaveTextContent(/audioFeatureDescriptor/i);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[PropertyGroupPanel] Unsupported property type encountered',
            expect.objectContaining({ key: 'legacyDescriptor', type: 'audioFeatureDescriptor' })
        );
    });

    it('renders a registered layout control while retaining explicitly requested scalar rows', () => {
        const properties = [
            { key: 'x', label: 'X', type: 'number', default: 0, min: -10, max: 10, step: 1 },
            { key: 'y', label: 'Y', type: 'number', default: 0, min: -10, max: 10, step: 1 },
        ] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'position',
            label: 'Position',
            collapsed: false,
            properties,
            layout: [
                {
                    kind: 'control',
                    control: 'xy-pad',
                    bindings: { x: 'x', y: 'y' },
                    options: { label: 'Position pad' },
                },
                { kind: 'property', propertyKey: 'x' },
                { kind: 'property', propertyKey: 'y' },
            ],
        };

        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{ x: 2, y: 3 }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={vi.fn()}
                onValuesChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );

        expect(screen.getByRole('group', { name: 'Position pad' })).toBeInTheDocument();
        expect(screen.getAllByText('X')).toHaveLength(2);
        expect(screen.getAllByText('Y')).toHaveLength(2);
    });

    it('retains the property row for a slider control when requested, including its animation control', () => {
        const properties = [
            { key: 'strength', label: 'Strength', type: 'number', default: 50, min: 0, max: 100, step: 1 },
        ] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'perspective',
            label: 'Perspective',
            collapsed: false,
            properties,
            layout: [
                { kind: 'control', control: 'slider', bindings: { value: 'strength' } },
                { kind: 'property', propertyKey: 'strength' },
            ],
        };

        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{ strength: 50 }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={vi.fn()}
                onValuesChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );

        expect(screen.getByRole('group', { name: 'Strength' })).toBeInTheDocument();
        expect(document.querySelector('#config-strength')).toBeInstanceOf(HTMLInputElement);
        expect(screen.getByTitle('Enable automation')).toBeInTheDocument();
    });

    it('uses slider layout range options while falling back to unspecified property metadata', () => {
        const properties = [
            { key: 'opacity', label: 'Opacity', type: 'number', default: 1, min: 0, max: 1, step: 1 },
        ] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'appearance',
            label: 'Appearance',
            collapsed: false,
            properties,
            layout: [
                {
                    kind: 'control',
                    control: 'slider',
                    bindings: { value: 'opacity' },
                    options: { step: 0.01 },
                },
            ],
        };

        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{ opacity: 0.5 }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={vi.fn()}
                onValuesChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );

        const slider = screen.getByRole('slider');
        expect(slider).toHaveAttribute('min', '0');
        expect(slider).toHaveAttribute('max', '1');
        expect(slider).toHaveAttribute('step', '0.01');
    });

    it('falls back to scalar rows when a layout control is unknown', () => {
        const properties = [{ key: 'x', label: 'X', type: 'number', default: 0 }] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'fallback',
            label: 'Fallback',
            collapsed: false,
            properties,
            layout: [{ kind: 'control', control: 'future-control', bindings: { x: 'x' } }],
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{ x: 2 }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={vi.fn()}
                onValuesChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );
        expect(screen.getAllByText('X')).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith('[PropertyLayoutRenderer] Falling back to property rows', expect.any(Object));
        warn.mockRestore();
    });

    it('shows layout sections as expandable children of the property group', () => {
        const properties = [{ key: 'x', label: 'X', type: 'number', default: 0 }] as PropertyDefinition[];
        const group: PropertyGroup = {
            id: 'layout',
            label: 'Layout',
            collapsed: false,
            properties,
            layout: [
                {
                    kind: 'section',
                    id: 'position',
                    label: 'Position',
                    collapsed: false,
                    children: [{ kind: 'property', propertyKey: 'x' }],
                },
            ],
        };

        render(
            <PropertyGroupPanel
                group={group}
                properties={properties}
                values={{ x: 2 }}
                macroAssignments={{}}
                elementId="test-element"
                onValueChange={vi.fn()}
                onValuesChange={vi.fn()}
                onMacroAssignment={vi.fn()}
                onCollapseToggle={vi.fn()}
            />
        );

        const section = screen.getByRole('button', { name: 'Collapse Position section' });
        expect(section).toHaveAttribute('aria-expanded', 'true');
        expect(section.querySelector('.ae-property-layout-section-caret')).toHaveTextContent('▾');
        expect(screen.getByText('X')).toBeInTheDocument();

        fireEvent.click(section);

        expect(screen.getByRole('button', { name: 'Expand Position section' })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        expect(screen.queryByText('X')).not.toBeInTheDocument();
    });
});
