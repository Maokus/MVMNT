import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useWorkspacePanelsStore } from '@state/workspacePanelsStore';
import WorkspaceDock from '../WorkspaceDock';

// jsdom has no PointerEvent; a MouseEvent subclass carries button/clientX for fireEvent.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({
        exportSettings: { width: 1920, height: 1080 },
        debugSettings: {},
        exportSequence: () => {},
        exportStatus: 'idle',
        visualizer: null,
        setExportSettings: () => {},
        setDebugSettings: () => {},
        canvasRef: { current: null },
    }),
}));

vi.mock('@context/SceneSelectionContext', () => ({
    useSceneSelection: () => ({
        selectedElementId: null,
        selectedElement: null,
        selectedElementSchema: null,
        propertyPanelRefresh: 0,
        clearSelection: () => {},
        updateElementConfig: () => {},
        addElement: () => {},
    }),
}));

vi.mock('@workspace/panels/scene-element', () => ({
    SceneElementPanel: () => null,
    ElementDropdown: () => null,
}));

vi.mock('@workspace/panels/properties', () => ({ PropertiesPanel: () => null }));
vi.mock('@workspace/panels/asset-manager/AssetManagerPanel', () => ({ default: () => null }));
vi.mock('@workspace/panels/properties/MacroConfig', () => ({ default: () => null }));

const reset = () =>
    useWorkspacePanelsStore.setState({
        order: { left: ['assets'], right: ['elements', 'properties', 'macros'] },
        hidden: { assets: false, elements: false, properties: false, macros: true },
        active: { left: 'assets', right: 'elements' },
        widths: { left: 220, right: 320 },
        dragging: null,
    });

describe('WorkspaceDock tab dragging', () => {
    beforeEach(reset);

    it('shows the snap guide while a tab is dragged', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        fireEvent.pointerMove(window, { clientX: 700, clientY: 20 });

        await waitFor(() => expect(container.querySelector('.dock-tab-guide')).not.toBeNull());
    });

    it('reorders the dragged tab on release', async () => {
        const { getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        fireEvent.pointerMove(window, { clientX: 700, clientY: 20 });
        fireEvent.pointerUp(window);

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().order.right).toEqual(['elements', 'macros', 'properties'])
        );
    });

    it('leaves the tab order alone and activates on a plain click', async () => {
        const { getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        fireEvent.pointerUp(window);
        fireEvent.click(tab);

        await waitFor(() => expect(useWorkspacePanelsStore.getState().active.right).toBe('properties'));
        expect(useWorkspacePanelsStore.getState().order.right).toEqual(['elements', 'properties', 'macros']);
    });
});
