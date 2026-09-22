import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import ElementPropertiesPanel from '../ElementPropertiesPanel';

vi.mock('@context/MacroContext', () => {
    const context = {
        macros: [],
        assignListener: () => () => {},
    };

    return {
        useMacros: () => context,
    };
});

vi.mock('../NodeTransformPanel', () => ({
    NodeTransformPanel: ({ searchTerm = '' }: { searchTerm?: string }) => <div>Host controls: {searchTerm}</div>,
    nodeTransformSearchHasMatches: (searchTerm: string) => 'host controls'.includes(searchTerm.toLowerCase()),
}));

vi.mock('../PropertyGroupPanel', () => ({
    default: ({
        properties,
        group,
        onCollapseToggle,
    }: {
        properties: Array<{ key: string; label: string }>;
        group: { id: string; label: string; collapsed: boolean };
        onCollapseToggle: (id: string, recursive?: boolean) => void;
    }) => (
        <div>
            <button
                aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label} group`}
                onClick={(event) => onCollapseToggle(group.id, event.metaKey)}
            >
                {group.label}
            </button>
            {properties.map((property) => property.label).join(', ')}
        </div>
    ),
}));

describe('ElementPropertiesPanel host tab', () => {
    beforeEach(() => {
        useSceneEditorStore.setState({ activePropertyTab: {}, expandedPropertyGroups: {}, propertyClipboard: null });
    });

    afterEach(cleanup);

    it('keeps the shared property actions available when Host is selected', () => {
        render(
            <ElementPropertiesPanel
                elementId="element:one"
                elementType="test"
                schema={{
                    name: 'Test element',
                    description: 'Test schema for the properties panel.',
                    tabs: [{ id: 'appearance', label: 'Appearance', groups: [] }],
                }}
                bindings={{}}
                onConfigChange={vi.fn()}
                includeNodeTransforms
            />
        );

        const hostTab = screen.getByRole('button', { name: 'Host' });
        fireEvent.click(hostTab);

        expect(hostTab).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'More property actions' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Search properties' })).toBeInTheDocument();
    });

    it('replaces the tabs with a search across host and every element tab', () => {
        render(
            <ElementPropertiesPanel
                elementId="element:one"
                elementType="test"
                schema={{
                    name: 'Test element',
                    description: 'Test schema for the properties panel.',
                    tabs: [
                        {
                            id: 'appearance',
                            label: 'Appearance',
                            groups: [
                                {
                                    id: 'paint',
                                    label: 'Paint',
                                    properties: [{ key: 'color', type: 'color', label: 'Color', default: '#fff' }],
                                },
                            ],
                        },
                        {
                            id: 'motion',
                            label: 'Motion',
                            groups: [
                                {
                                    id: 'movement',
                                    label: 'Movement',
                                    properties: [{ key: 'speed', type: 'number', label: 'Speed', default: 1 }],
                                },
                            ],
                        },
                    ],
                }}
                bindings={{}}
                onConfigChange={vi.fn()}
                includeNodeTransforms
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Search properties' }));

        expect(screen.queryByRole('button', { name: 'Host' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument();
        expect(screen.getByText('Host controls:')).toBeInTheDocument();
        expect(screen.getByText('Color')).toBeInTheDocument();
        expect(screen.getByText('Speed')).toBeInTheDocument();

        const search = screen.getByPlaceholderText('Search properties…');
        fireEvent.change(search, { target: { value: 'speed' } });

        expect(screen.getByText('Host controls: speed')).toBeInTheDocument();
        expect(screen.queryByText('Color')).not.toBeInTheDocument();
        expect(screen.getByText('Speed')).toBeInTheDocument();

        fireEvent.change(search, { target: { value: '' } });
        expect(search).toBeInTheDocument();
        expect(screen.getByText('Color')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Close search'));
        expect(screen.getByRole('button', { name: 'Host' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
    });

    it('Meta-click sets every group in the active tab to the clicked group’s next state', () => {
        render(
            <ElementPropertiesPanel
                elementId="element:one"
                elementType="test"
                bindings={{}}
                onConfigChange={vi.fn()}
                schema={{
                    name: 'Test',
                    description: '',
                    tabs: [
                        {
                            id: 'appearance',
                            label: 'Appearance',
                            groups: [
                                {
                                    id: 'one',
                                    label: 'One',
                                    collapsed: false,
                                    properties: [{ key: 'a', type: 'number', label: 'A', default: 1 }],
                                },
                                {
                                    id: 'two',
                                    label: 'Two',
                                    collapsed: true,
                                    properties: [{ key: 'b', type: 'number', label: 'B', default: 2 }],
                                },
                            ],
                        },
                    ],
                }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Collapse One group' }), { metaKey: true });
        expect(useSceneEditorStore.getState().expandedPropertyGroups['element:one']).toMatchObject({
            one: true,
            two: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Expand Two group' }), { metaKey: true });
        expect(useSceneEditorStore.getState().expandedPropertyGroups['element:one']).toMatchObject({
            one: false,
            two: false,
        });
    });
});
