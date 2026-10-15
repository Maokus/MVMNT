import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspacePanelsStore, type DockSections } from '../workspacePanelsStore';

const baseSections = (): DockSections => ({
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
});

const reset = () =>
    useWorkspacePanelsStore.setState({
        sections: baseSections(),
        hidden: { assets: false, elements: false, properties: false, macros: true },
        widths: { left: 220, right: 320 },
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
                left: [{ tabs: ['assets'], active: 'assets' }],
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
});
