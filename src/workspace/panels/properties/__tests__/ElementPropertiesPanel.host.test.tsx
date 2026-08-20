import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import ElementPropertiesPanel from '../ElementPropertiesPanel';

vi.mock('@context/MacroContext', () => {
    const context = {
        macros: [],
        assignListener: () => () => { },
    };

    return {
        useMacros: () => context,
    };
});

vi.mock('../NodeTransformPanel', () => ({
    NodeTransformPanel: () => <div>Host controls</div>,
}));

vi.mock('../PropertyGroupPanel', () => ({
    default: () => null,
}));

describe('ElementPropertiesPanel host tab', () => {
    beforeEach(() => {
        useSceneEditorStore.setState({ activePropertyTab: {}, propertyClipboard: null });
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
});
