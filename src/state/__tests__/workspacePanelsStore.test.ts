import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspacePanelsStore } from '../workspacePanelsStore';

const reset = () =>
    useWorkspacePanelsStore.setState({
        order: { left: ['assets'], right: ['elements', 'properties', 'macros'] },
        hidden: { assets: false, elements: false, properties: false, macros: true },
        active: { left: 'assets', right: 'elements' },
        widths: { left: 220, right: 320 },
        dragging: null,
    });

describe('workspace panels store', () => {
    beforeEach(reset);

    it('shows a hidden panel and activates it on its side', () => {
        useWorkspacePanelsStore.getState().toggle('macros');
        const state = useWorkspacePanelsStore.getState();
        expect(state.hidden.macros).toBe(false);
        expect(state.active.right).toBe('macros');
    });

    it('hides the active panel and falls back to another visible tab on that side', () => {
        useWorkspacePanelsStore.getState().toggle('elements');
        const state = useWorkspacePanelsStore.getState();
        expect(state.hidden.elements).toBe(true);
        expect(state.active.right).toBe('properties');
        expect(state.order.left).toEqual(['assets']);
    });

    it('re-docks a single tab without moving the rest of the dock', () => {
        useWorkspacePanelsStore.getState().moveTab('properties', 'left', 1);
        const state = useWorkspacePanelsStore.getState();
        expect(state.order.left).toEqual(['assets', 'properties']);
        expect(state.order.right).toEqual(['elements', 'macros']);
        expect(state.active.left).toBe('properties');
    });

    it('reorders within a side without changing the active tab', () => {
        useWorkspacePanelsStore.getState().moveTab('macros', 'right', 0);
        const state = useWorkspacePanelsStore.getState();
        expect(state.order.right).toEqual(['macros', 'elements', 'properties']);
        expect(state.active.right).toBe('elements');
    });
});
