import { beforeEach, describe, expect, it } from 'vitest';
import {
    useWorkspacePanelsStore,
    dragSectionWeight,
    isPanelVisible,
    normalizeSectionWeights,
    panelSide,
    WORKSPACE_PANEL_IDS,
    type DockSections,
} from '../workspacePanelsStore';

const baseSections = (): DockSections => ({
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
    top: [],
    bottom: [],
});

const reset = () =>
    useWorkspacePanelsStore.setState({
        sections: baseSections(),
        hidden: { assets: false, elements: false, properties: false, macros: true },
        widths: { left: 220, right: 320 },
        heights: { top: 200, bottom: 200 },
        sectionWeights: { left: [1], right: [1] },
        dragging: null,
    });

describe('workspace panels store', () => {
    beforeEach(reset);

    it('shows a hidden panel and activates it in its section', () => {
        useWorkspacePanelsStore.getState().toggle('macros');
        const state = useWorkspacePanelsStore.getState();
        expect(state.hidden.macros).toBe(false);
        expect(state.sections.right[0].active).toBe('macros');
    });

    it('hides the active panel and falls back to another visible tab in that section', () => {
        useWorkspacePanelsStore.getState().toggle('elements');
        const state = useWorkspacePanelsStore.getState();
        expect(state.hidden.elements).toBe(true);
        expect(state.sections.right[0].active).toBe('properties');
        expect(state.sections.left).toEqual([{ tabs: ['assets'], active: 'assets' }]);
    });

    it('re-docks a single tab without moving the rest of the dock', () => {
        useWorkspacePanelsStore.getState().moveTab('properties', {
            side: 'left',
            sectionIndex: 0,
            tabIndex: 1,
            split: false,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.left).toEqual([{ tabs: ['assets', 'properties'], active: 'properties' }]);
        expect(state.sections.right).toEqual([{ tabs: ['elements', 'macros'], active: 'elements' }]);
    });

    it('reorders within a section without changing its active tab', () => {
        useWorkspacePanelsStore.getState().moveTab('macros', {
            side: 'right',
            sectionIndex: 0,
            tabIndex: 0,
            split: false,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.right[0].tabs).toEqual(['macros', 'elements', 'properties']);
        expect(state.sections.right[0].active).toBe('elements');
    });

    it('splits a dock into two stacked sections when a tab is dropped on its body', () => {
        useWorkspacePanelsStore.getState().moveTab('properties', {
            side: 'right',
            sectionIndex: 1,
            tabIndex: 0,
            split: true,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.right).toEqual([
            { tabs: ['elements', 'macros'], active: 'elements' },
            { tabs: ['properties'], active: 'properties' },
        ]);
    });

    it('splits above the section the pointer was over', () => {
        useWorkspacePanelsStore.getState().moveTab('assets', {
            side: 'right',
            sectionIndex: 0,
            tabIndex: 0,
            split: true,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.right.map((section) => section.tabs)).toEqual([
            ['assets'],
            ['elements', 'properties', 'macros'],
        ]);
        expect(state.sections.left).toEqual([]);
    });

    it('drop section collapse: empty sections are pruned when their last tab leaves', () => {
        useWorkspacePanelsStore.setState({
            sections: {
                ...baseSections(),
                right: [
                    { tabs: ['elements'], active: 'elements' },
                    { tabs: ['properties'], active: 'properties' },
                ],
            },
        });
        useWorkspacePanelsStore.getState().moveTab('properties', {
            side: 'left',
            sectionIndex: 0,
            tabIndex: 1,
            split: false,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.right).toEqual([{ tabs: ['elements'], active: 'elements' }]);
    });

    it('moves a tab into a top dock that has no section yet', () => {
        useWorkspacePanelsStore.getState().moveTab('properties', {
            side: 'top',
            sectionIndex: 0,
            tabIndex: 0,
            split: false,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.top).toEqual([{ tabs: ['properties'], active: 'properties' }]);
        expect(state.sections.right).toEqual([{ tabs: ['elements', 'macros'], active: 'elements' }]);
    });

    it('merges a tab into the end of another dock', () => {
        useWorkspacePanelsStore.getState().moveTab('assets', {
            side: 'right',
            sectionIndex: 0,
            tabIndex: 3,
            split: false,
        });
        const state = useWorkspacePanelsStore.getState();
        expect(state.sections.right).toEqual([
            { tabs: ['elements', 'properties', 'macros', 'assets'], active: 'assets' },
        ]);
        expect(state.sections.left).toEqual([]);
    });

    it('finds a panel in any of the four docks', () => {
        useWorkspacePanelsStore.setState({
            sections: {
                left: [{ tabs: ['assets'], active: 'assets' }],
                right: [{ tabs: ['elements', 'properties'], active: 'elements' }],
                top: [{ tabs: ['macros'], active: 'macros' }],
                bottom: [],
            },
        });
        expect(panelSide(useWorkspacePanelsStore.getState().sections, 'macros')).toBe('top');
    });

    it('stores dock heights independently of widths', () => {
        useWorkspacePanelsStore.getState().setHeight('bottom', 260);
        const state = useWorkspacePanelsStore.getState();
        expect(state.heights).toEqual({ top: 200, bottom: 260 });
        expect(state.widths).toEqual({ left: 220, right: 320 });
    });

    it('resets the layout to the factory docks', () => {
        useWorkspacePanelsStore.getState().moveTab('assets', {
            side: 'bottom',
            sectionIndex: 0,
            tabIndex: 0,
            split: false,
        });
        useWorkspacePanelsStore.getState().setHeight('bottom', 300);
        useWorkspacePanelsStore.getState().setDragging('assets');

        useWorkspacePanelsStore.getState().reset();

        const state = useWorkspacePanelsStore.getState();
        expect(state.sections).toEqual(baseSections());
        expect(state.hidden).toEqual({ assets: false, elements: false, properties: false, macros: true });
        expect(state.widths).toEqual({ left: 220, right: 320 });
        expect(state.heights).toEqual({ top: 200, bottom: 200 });
    });
});

describe('isPanelVisible', () => {
    beforeEach(reset);

    it('marks every open tab of a dock, not only its front tab', () => {
        const { sections, hidden } = useWorkspacePanelsStore.getState();
        expect(isPanelVisible(sections, hidden, 'assets')).toBe(true);
        expect(isPanelVisible(sections, hidden, 'elements')).toBe(true);
        expect(isPanelVisible(sections, hidden, 'properties')).toBe(true);
        expect(isPanelVisible(sections, hidden, 'macros')).toBe(false);
    });

    it('closes an open panel on one click and reopens it on the next', () => {
        const panels = () => {
            const { sections, hidden } = useWorkspacePanelsStore.getState();
            return WORKSPACE_PANEL_IDS.filter((id) => isPanelVisible(sections, hidden, id));
        };
        expect(panels()).toEqual(['assets', 'elements', 'properties']);

        useWorkspacePanelsStore.getState().toggle('properties');
        expect(panels()).toEqual(['assets', 'elements']);

        useWorkspacePanelsStore.getState().toggle('properties');
        expect(panels()).toEqual(['assets', 'elements', 'properties']);
    });

    it('closing a background tab keeps the section front tab', () => {
        useWorkspacePanelsStore.getState().toggle('properties');
        const { sections } = useWorkspacePanelsStore.getState();
        expect(sections.right[0].active).toBe('elements');
    });

    it('is false for a docked but hidden panel', () => {
        useWorkspacePanelsStore.setState({
            hidden: { assets: false, elements: true, properties: false, macros: true },
        });
        const { sections, hidden } = useWorkspacePanelsStore.getState();
        expect(isPanelVisible(sections, hidden, 'elements')).toBe(false);
    });

    it('follows a panel that was re-docked into another side', () => {
        useWorkspacePanelsStore.getState().moveTab('properties', {
            side: 'left',
            sectionIndex: 0,
            tabIndex: 1,
            split: false,
        });
        const { sections, hidden } = useWorkspacePanelsStore.getState();
        expect(isPanelVisible(sections, hidden, 'properties')).toBe(true);
        expect(isPanelVisible(sections, hidden, 'elements')).toBe(true);
    });
});

describe('stacked section weights', () => {
    beforeEach(reset);

    it('splits a stacked dock evenly by default', () => {
        expect(normalizeSectionWeights(useWorkspacePanelsStore.getState().sectionWeights.right, 3)).toEqual([1, 1, 1]);
    });

    it('pads missing weights and ignores extras so the count can change', () => {
        expect(normalizeSectionWeights([2, 1], 3)).toEqual([2, 1, 1]);
        expect(normalizeSectionWeights([2, 1, 3], 2)).toEqual([2, 1]);
    });

    it('moves the shared boundary when a divider is dragged', () => {
        const next = dragSectionWeight([1, 1], 0, 0.5, 0.1);
        expect(next[0]).toBeCloseTo(1.5, 5);
        expect(next[1]).toBeCloseTo(0.5, 5);
    });

    it('stops a divider before either stacked panel collapses', () => {
        expect(dragSectionWeight([1, 1], 0, 10, 0.25)).toEqual([1.75, 0.25]);
        expect(dragSectionWeight([1, 1], 0, -10, 0.25)).toEqual([0.25, 1.75]);
    });

    it('keeps divider weights per side and restores them on reset', () => {
        useWorkspacePanelsStore.getState().setSectionWeights('right', [2, 1]);
        expect(useWorkspacePanelsStore.getState().sectionWeights).toEqual({ left: [1], right: [2, 1] });

        useWorkspacePanelsStore.getState().reset();
        expect(useWorkspacePanelsStore.getState().sectionWeights).toEqual({ left: [1], right: [1] });
    });
});
