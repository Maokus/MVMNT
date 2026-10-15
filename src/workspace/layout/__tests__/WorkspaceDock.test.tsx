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

    it('shows the drag chip while a tab is dragged and no guide inside the dock', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        fireEvent.pointerMove(window, { clientX: 700, clientY: 20 });

        await waitFor(() => expect(container.querySelector('[data-drag-chip="true"]')).not.toBeNull());
        // Same-dock reordering is deliberately unmarked: nothing else competes with it.
        expect(container.querySelector('[data-dock-guide]')).toBeNull();
    });

    it('keeps the drag active when the pointer is over the opposite dock side', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        // window.innerWidth is 1024 in jsdom, so x < 256 sits in the opposite (left) quarter.
        fireEvent.pointerMove(window, { clientX: 100, clientY: 20 });

        await waitFor(() => expect(container.querySelector('[data-drag-chip="true"]')).not.toBeNull());

        // The dragged tab is dimmed, which is how the gesture reads as active.
        expect(tab.className).toContain('opacity-50');
    });

    it('shows a drop highlight over the opposite dock while a tab is dragged', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });
        fireEvent.pointerMove(window, { clientX: 700, clientY: 20 });

        const zone = (await waitFor(() => {
            const el = container.querySelector('[data-dock-target="left"]');
            if (!el) throw new Error('drop highlight missing');
            return el;
        })) as HTMLElement;

        // The left dock has no measurable panel in jsdom, so the highlight falls back
        // to the strip the dock would occupy: the dock's own width and the height of the
        // dock band, so it can never spill over the timeline underneath.
        expect(zone.style.left).toBe('0px');
        expect(zone.style.top).toBe('48px');
        expect(zone.style.width).toBe('220px');
        expect(zone.style.height).toBe('720px');
        expect(container.querySelector('[data-drag-chip="true"]')).not.toBeNull();
    });

    it('adds the accent bar only once the pointer is inside the opposite dock', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 690, clientY: 20 });

        // Reordering inside its own dock: the other side stays a quiet tinted hint.
        fireEvent.pointerMove(window, { clientX: 700, clientY: 20 });
        await waitFor(() => expect(container.querySelector('[data-dock-target="left"]')).not.toBeNull());
        expect(container.querySelector('[data-drop-bar="true"]')).toBeNull();

        // Moving into the left dock: the bar appears, confirming the re-dock.
        fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });
        await waitFor(() => expect(container.querySelector('[data-drop-bar="true"]')).not.toBeNull());
    });

    it('drops a tab between the tabs of the opposite dock, not at the end', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        // jsdom lays nothing out, so give the target dock's tabs real midpoints:
        // Elements spans 704-764 (mid 734) and Properties 764-824 (mid 794).
        const tabRects: Array<[string, number]> = [
            ['elements', 704],
            ['properties', 764],
        ];
        for (const [id, left] of tabRects) {
            const el = container.querySelector(`[data-panel-id="${id}"]`)!;
            el.getBoundingClientRect = () =>
                ({ left, right: left + 60, top: 0, bottom: 0, width: 60, height: 0, x: left, y: 0 }) as DOMRect;
        }
        const tab = getByRole('tab', { name: 'Assets' });

        // Released at x=760: past Elements' midpoint, before Properties'.
        fireEvent.pointerDown(tab, { button: 0, clientX: 100, clientY: 20 });
        fireEvent.pointerMove(window, { clientX: 760, clientY: 300 });
        await waitFor(() => expect(container.querySelector('[data-drop-line="true"]')).not.toBeNull());
        fireEvent.pointerUp(window, { clientX: 760, clientY: 300 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().order.right).toEqual([
                'elements',
                'assets',
                'properties',
                'macros',
            ])
        );
        expect(useWorkspacePanelsStore.getState().order.left).toEqual([]);
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
