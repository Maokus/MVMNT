import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SidePanels from '../SidePanels';
import PropertyTabStrip from '@workspace/panels/properties/PropertyTabStrip';

const onTabChange = vi.hoisted(() => vi.fn());

vi.mock('@context/VisualizerContext', () => ({ useVisualizer: () => ({}) }));
vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => ({}) }));
vi.mock('@workspace/panels/scene-element', () => ({
    SceneElementPanel: () => <div>Scene hierarchy</div>,
    ElementDropdown: () => null,
}));
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

describe('side panel width constraints', () => {
    it.each([
        [1440, 'minmax(0, 1fr)'],
        [1024, '260px 6px minmax(0, 1fr)'],
    ])('keeps many property tabs within the allocated grid at viewport width %i', (width, columns) => {
        vi.stubGlobal('innerWidth', width);
        const { container } = render(<SidePanels />);
        const grid = container.firstElementChild as HTMLElement;

        // Grid tracks and their items must both allow the tab scroller to shrink.
        expect(grid.style.gridTemplateColumns).toBe(columns);
        expect(screen.getByText('Properties').parentElement?.parentElement).toHaveClass('min-w-0');
        expect(screen.getByText('Elements').parentElement?.parentElement).toHaveClass('min-w-0');
        expect(screen.getByRole('button', { name: 'Search properties' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Property category 19' }));
        expect(onTabChange).toHaveBeenCalledWith('tab-19');
    });
});
