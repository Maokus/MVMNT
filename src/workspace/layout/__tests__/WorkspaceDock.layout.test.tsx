import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceDock from '../WorkspaceDock';
import { useWorkspacePanelsStore, type DockSide } from '@state/workspacePanelsStore';
import PropertyTabStrip from '@workspace/panels/properties/PropertyTabStrip';

const onTabChange = vi.hoisted(() => vi.fn());

vi.mock('@context/VisualizerContext', () => ({ useVisualizer: () => ({}) }));
vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => ({}) }));
vi.mock('@workspace/panels/scene-element', () => ({
    SceneElementPanel: () => <div>Scene hierarchy</div>,
    ElementDropdown: () => null,
}));
vi.mock('@workspace/panels/asset-manager/AssetManagerPanel', () => ({ default: () => null }));
vi.mock('@workspace/panels/properties/MacroConfig', () => ({ default: () => null }));
vi.mock('@workspace/panels/properties', () => ({
    PropertiesPanel: () => (
        <PropertyTabStrip
            tabs={Array.from({ length: 20 }, (_, index) => ({
                id: `tab-${index}`,
                label: `Property category ${index}`,
                groups: [],
            }))}
            activeTabId="tab-0"
            onTabChange={onTabChange}
            onSearch={() => {}}
        />
    ),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    onTabChange.mockClear();
});

describe('dock panel width constraints', () => {
    it.each<DockSide>(['left', 'right', 'top', 'bottom'])('keeps many property tabs within the %s dock', (side) => {
        useWorkspacePanelsStore.setState({
            sections: {
                left: [],
                right: [],
                top: [],
                bottom: [],
                [side]: [{ tabs: ['properties'], active: 'properties' }],
            },
            hidden: { assets: true, elements: true, properties: false, macros: true },
        });
        const { container } = render(<WorkspaceDock side={side} />);
        expect(container.querySelector('[data-dock-side]')).toHaveClass('min-w-0');
        expect(container.querySelector('[data-dock-section]')).toHaveClass('min-w-0');
        expect(container.querySelector('[data-panel-body="properties"]')).toHaveClass('min-w-0');
        expect(screen.getByRole('button', { name: 'Search properties' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Property category 19' }));
        expect(onTabChange).toHaveBeenCalledWith('tab-19');
    });
});
