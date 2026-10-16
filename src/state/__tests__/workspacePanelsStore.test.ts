import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspacePanelsStore, panelSide, type DockSections } from '../workspacePanelsStore';

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
        // Both panels are now listed in their own section, so both stay visible.
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
