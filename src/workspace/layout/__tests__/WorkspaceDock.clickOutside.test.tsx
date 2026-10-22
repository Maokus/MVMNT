import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useWorkspacePanelsStore, type DockSections } from '@state/workspacePanelsStore';
import WorkspaceDock from '../WorkspaceDock';
import { ClearSelectionOnBackgroundClick } from '../ClearSelectionOnBackgroundClick';

const clearSelection = vi.hoisted(() => vi.fn());

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
        selectedElementId: 'element-1',
        selectedElement: null,
        selectedElementSchema: null,
        propertyPanelRefresh: 0,
        clearSelection,
        updateElementConfig: () => {},
        addElement: () => {},
    }),
}));

vi.mock('@workspace/panels/scene-element', () => ({
    SceneElementPanel: () => <div data-panel-autofocus tabIndex={-1} />,
    ElementDropdown: () => null,
}));

vi.mock('@workspace/panels/properties', () => ({ PropertiesPanel: () => null }));
vi.mock('@workspace/panels/asset-manager/AssetManagerPanel', () => ({ default: () => null }));
vi.mock('@workspace/panels/properties/MacroConfig', () => ({ default: () => null }));

const sections = (): DockSections => ({
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements'], active: 'elements' }],
    top: [],
    bottom: [],
});

describe('WorkspaceDock click-outside selection', () => {
    beforeEach(() => {
        clearSelection.mockClear();
        useWorkspacePanelsStore.setState({
            sections: sections(),
            hidden: { assets: false, elements: false, properties: false, macros: true },
        });
    });

    it('keeps the selection when the click lands in another dock', () => {
        const { container } = render(
            <>
                <ClearSelectionOnBackgroundClick />
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        const rightPanel = container.querySelector('[data-dock-side="right"] [role="tab"]');
        if (!rightPanel) throw new Error('expected a right-dock tab');

        fireEvent.mouseDown(rightPanel);

        expect(clearSelection).not.toHaveBeenCalled();
    });

    it('clears the selection when the click lands outside every dock', () => {
        render(
            <>
                <ClearSelectionOnBackgroundClick />
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );

        fireEvent.mouseDown(document.body);

        expect(clearSelection).toHaveBeenCalled();
    });

    it('focuses an opted-in panel body when its tab is activated', async () => {
        const { container } = render(<WorkspaceDock side="right" />);
        const tab = container.querySelector<HTMLElement>('[data-dock-side="right"] [role="tab"]');
        if (!tab) throw new Error('expected a right-dock tab');

        fireEvent.click(tab);

        await waitFor(() => {
            expect(container.querySelector('[data-panel-autofocus]')).toHaveFocus();
        });
    });
});
