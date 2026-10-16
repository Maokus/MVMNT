import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useWorkspacePanelsStore, type DockSections } from '@state/workspacePanelsStore';
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

const sections = (): DockSections => ({
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
    top: [],
    bottom: [],
});

const reset = () =>
    useWorkspacePanelsStore.setState({
        sections: sections(),
        hidden: { assets: false, elements: false, properties: false, macros: true },
        widths: { left: 220, right: 320 },
        heights: { top: 200, bottom: 200 },
        dragging: null,
    });

interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });

const stub = (el: Element | null | undefined, r: Rect) => {
    if (!el) return;
    el.getBoundingClientRect = () =>
        ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) as unknown as DOMRect;
};

const DOCK: Record<'left' | 'right', Rect> = { left: rect(0, 48, 220, 570), right: rect(700, 48, 320, 570) };

// jsdom lays nothing out, so give one dock the same geometry it has in the app: a strip
// across the top and the panel body filling the rest, split evenly between sections.
const layoutDock = (container: HTMLElement, side: 'left' | 'right') => {
    const dock = container.querySelector(`[data-dock-side="${side}"]`);
    stub(dock, DOCK[side]);
    const sectionEls = Array.from(dock?.querySelectorAll('[data-dock-section]') ?? []);
    const body = { top: DOCK[side].top + 22, height: DOCK[side].height - 22 };
    sectionEls.forEach((sectionEl, index) => {
        const top = body.top + (body.height / sectionEls.length) * index;
        const height = body.height / sectionEls.length;
        stub(sectionEl, rect(DOCK[side].left, top, DOCK[side].width, height));
        stub(sectionEl.querySelector('[data-dock-strip]'), rect(DOCK[side].left, top, DOCK[side].width, 26));
    });
    return dock;
};

describe('WorkspaceDock tab dragging', () => {
    beforeEach(reset);

    it('renders one strip per section, so a split dock shows both panels at once', () => {
        useWorkspacePanelsStore.setState({
            sections: {
                ...sections(),
                right: [
                    { tabs: ['elements'], active: 'elements' },
                    { tabs: ['properties'], active: 'properties' },
                ],
            },
        });
        const { container } = render(<WorkspaceDock side="right" />);

        expect(container.querySelectorAll('[data-dock-section]')).toHaveLength(2);
        expect(container.querySelectorAll('[role="tablist"]')).toHaveLength(2);
        const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);
        expect(tabs).toEqual(['Elements', 'Properties']);
    });

    it('shows the drag chip and no insertion line while reordering inside its own section', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        layoutDock(container, 'right');
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 908, clientY: 80 });

        await waitFor(() => expect(container.querySelector('[data-drag-chip="true"]')).not.toBeNull());
        // Reordering inside the strip a tab already lives in is deliberately unmarked.
        expect(container.querySelector('[data-drop-line="true"]')).toBeNull();
        expect(container.querySelector('[data-dock-guide]')).toBeNull();
    });

    it('splits the opposite dock in half when a tab is dropped on its panel body', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        layoutDock(container, 'left');
        layoutDock(container, 'right');
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        // y=400 is below the middle of the left dock's only section, so the panel lands under it.
        fireEvent.pointerMove(window, { clientX: 100, clientY: 400 });

        const zone = (await waitFor(() => {
            const el = container.querySelector('[data-dock-target="left"]');
            if (!el) throw new Error('drop highlight missing');
            return el;
        })) as HTMLElement;
        // The marker covers exactly the half the new stacked section will occupy.
        expect(zone.style.left).toBe('0px');
        expect(zone.style.top).toBe('344px');
        expect(zone.style.width).toBe('220px');
        expect(zone.style.height).toBe('274px');

        fireEvent.pointerUp(window, { clientX: 100, clientY: 400 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.left.map((section) => section.tabs)).toEqual([
                ['assets'],
                ['properties'],
            ])
        );
        expect(useWorkspacePanelsStore.getState().sections.right).toEqual([
            { tabs: ['elements', 'macros'], active: 'elements' },
        ]);
    });

    it('splits its own dock so the dragged panel and the existing one are both visible', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        layoutDock(container, 'right');
        const tab = getByRole('tab', { name: 'Elements' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 900, clientY: 500 });
        fireEvent.pointerUp(window, { clientX: 900, clientY: 500 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.right).toEqual([
                { tabs: ['properties', 'macros'], active: 'properties' },
                { tabs: ['elements'], active: 'elements' },
            ])
        );
    });

    it('drops a tab between the tabs of another strip, not at the end', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <WorkspaceDock side="right" />
            </>
        );
        layoutDock(container, 'left');
        layoutDock(container, 'right');
        // Elements spans 704-764 (mid 734) and Properties 764-824 (mid 794).
        const tabRects: Array<[string, number]> = [
            ['elements', 704],
            ['properties', 764],
        ];
        for (const [id, left] of tabRects) {
            stub(container.querySelector(`[data-panel-id="${id}"]`), rect(left, 70, 60, 26));
        }
        const tab = getByRole('tab', { name: 'Assets' });

        // Released at x=760 on the right dock's strip: past Elements' midpoint, before Properties'.
        fireEvent.pointerDown(tab, { button: 0, clientX: 100, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 760, clientY: 80 });
        await waitFor(() => expect(container.querySelector('[data-drop-line="true"]')).not.toBeNull());
        fireEvent.pointerUp(window, { clientX: 760, clientY: 80 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.right).toEqual([
                { tabs: ['elements', 'assets', 'properties', 'macros'], active: 'assets' },
            ])
        );
        expect(useWorkspacePanelsStore.getState().sections.left).toEqual([]);
    });

    it('re-docks a tab into a dock that has no panel yet', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });

        const zone = (await waitFor(() => {
            const el = container.querySelector('[data-dock-target="left"]');
            if (!el) throw new Error('drop highlight missing');
            return el;
        })) as HTMLElement;
        // The empty dock has nothing to measure, so the marker falls back to the strip it
        // would occupy: the configured width, and never taller than the dock band.
        expect(zone.style.left).toBe('0px');
        expect(zone.style.top).toBe('48px');
        expect(zone.style.width).toBe('220px');
        expect(zone.style.height).toBe('720px');

        fireEvent.pointerUp(window, { clientX: 100, clientY: 300 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.left).toEqual([
                { tabs: ['assets', 'properties'], active: 'properties' },
            ])
        );
    });

    it('reorders the dragged tab on release', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        layoutDock(container, 'right');
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 908, clientY: 80 });
        fireEvent.pointerUp(window, { clientX: 908, clientY: 80 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.right[0].tabs).toEqual([
                'elements',
                'macros',
                'properties',
            ])
        );
    });

    it('leaves the tab order alone and activates on a plain click', async () => {
        const { container, getByRole } = render(<WorkspaceDock side="right" />);
        layoutDock(container, 'right');
        const tab = getByRole('tab', { name: 'Properties' });

        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerUp(window);
        fireEvent.click(tab);

        await waitFor(() => expect(useWorkspacePanelsStore.getState().sections.right[0].active).toBe('properties'));
        expect(useWorkspacePanelsStore.getState().sections.right[0].tabs).toEqual(['elements', 'properties', 'macros']);
    });

    it('docks to the top when a tab is dropped on the centre column top zone', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <div data-center-column="true" />
                <WorkspaceDock side="right" />
            </>
        );
        layoutDock(container, 'left');
        layoutDock(container, 'right');
        stub(container.querySelector('[data-center-column]'), rect(220, 48, 480, 570));

        const tab = getByRole('tab', { name: 'Properties' });
        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 460, clientY: 80 });

        await waitFor(() => expect(container.querySelector('[data-dock-guide="true"]')).not.toBeNull());
        expect(container.querySelector('[data-dock-guide-zone="top"][data-active="true"]')).not.toBeNull();
        const zone = container.querySelector('[data-dock-target="top"]') as HTMLElement;
        expect(zone).not.toBeNull();
        // The empty top dock has nothing to measure yet, so the marker is its default band.
        expect(zone.style.top).toBe('48px');
        expect(zone.style.height).toBe('200px');

        fireEvent.pointerUp(window, { clientX: 460, clientY: 80 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.top).toEqual([
                { tabs: ['properties'], active: 'properties' },
            ])
        );
        expect(useWorkspacePanelsStore.getState().sections.right).toEqual([
            { tabs: ['elements', 'macros'], active: 'elements' },
        ]);
    });

    it('merges a tab into the nearest dock when dropped in the middle of the centre column', async () => {
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="left" />
                <div data-center-column="true" />
                <WorkspaceDock side="right" />
            </>
        );
        layoutDock(container, 'left');
        layoutDock(container, 'right');
        stub(container.querySelector('[data-center-column]'), rect(220, 48, 480, 570));

        const tab = getByRole('tab', { name: 'Assets' });
        fireEvent.pointerDown(tab, { button: 0, clientX: 100, clientY: 80 });
        fireEvent.pointerMove(window, { clientX: 500, clientY: 330 });

        await waitFor(() => expect(container.querySelector('[data-dock-guide="true"]')).not.toBeNull());
        expect(container.querySelector('[data-dock-guide-zone="center"][data-active="true"]')).not.toBeNull();
        expect(container.querySelector('[data-dock-target="right"]')).not.toBeNull();

        fireEvent.pointerUp(window, { clientX: 500, clientY: 330 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.right).toEqual([
                { tabs: ['elements', 'properties', 'macros', 'assets'], active: 'assets' },
            ])
        );
        expect(useWorkspacePanelsStore.getState().sections.left).toEqual([]);
    });

    it('keeps a top dock to a single strip when a tab is dropped on its body', async () => {
        useWorkspacePanelsStore.setState({
            sections: {
                ...sections(),
                top: [{ tabs: ['macros'], active: 'macros' }],
            },
            hidden: { assets: false, elements: false, properties: false, macros: false },
        });
        const { container, getByRole } = render(
            <>
                <WorkspaceDock side="right" />
                <WorkspaceDock side="top" />
            </>
        );
        const topDock = container.querySelector('[data-dock-side="top"]');
        stub(topDock, rect(220, 48, 480, 200));
        stub(topDock?.querySelector('[data-dock-section]'), rect(220, 48, 480, 200));
        stub(topDock?.querySelector('[data-dock-strip]'), rect(220, 48, 480, 26));

        const tab = getByRole('tab', { name: 'Properties' });
        fireEvent.pointerDown(tab, { button: 0, clientX: 900, clientY: 80 });
        // y=150 is on the body, below the strip: a body drop must not split the top dock.
        fireEvent.pointerMove(window, { clientX: 460, clientY: 150 });
        fireEvent.pointerUp(window, { clientX: 460, clientY: 150 });

        await waitFor(() =>
            expect(useWorkspacePanelsStore.getState().sections.top).toEqual([
                { tabs: ['macros', 'properties'], active: 'properties' },
            ])
        );
    });
});
