import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspacePanelsStore, isPanelVisible } from '@state/workspacePanelsStore';
import MenuBar from '../MenuBar';

const renameScene = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const saveToLocal = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const saveAs = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@context/SceneContext', () => ({
    useScene: () => ({
        sceneName: 'Untitled',
        renameScene,
        saveToLocal,
        saveAs,
        isDirty: false,
        leaveWorkspace: vi.fn().mockResolvedValue(true),
    }),
}));

vi.mock('@workspace/templates/useTemplateApply', () => ({ useTemplateApply: () => vi.fn() }));

const resetLayout = () =>
    useWorkspacePanelsStore.setState({
        sections: {
            left: [{ tabs: ['assets'], active: 'assets' }],
            right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
            top: [],
            bottom: [],
        },
        hidden: { assets: false, elements: false, properties: false, macros: true },
        widths: { left: 220, right: 320 },
        heights: { top: 200, bottom: 200 },
        dragging: null,
    });

const store = () => useWorkspacePanelsStore.getState();
const visible = (id: 'assets' | 'elements' | 'properties' | 'macros') =>
    isPanelVisible(store().sections, store().hidden, id);

const openMenu = (label: 'View' | 'Help') => fireEvent.click(screen.getByRole('button', { name: label }));

const renderMenuBar = (props: { onHelp?: () => void; onControls?: () => void; onCommunity?: () => void } = {}) =>
    render(
        <MemoryRouter>
            <MenuBar {...props} />
        </MemoryRouter>
    );

describe('MenuBar View menu', () => {
    beforeEach(() => {
        resetLayout();
        vi.clearAllMocks();
    });

    it('lists every panel and ticks the ones the docks are showing, including background tabs', () => {
        renderMenuBar();
        openMenu('View');

        expect(screen.getByRole('menuitem', { name: '✓ Assets' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: '✓ Elements' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: '✓ Properties' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Macros' })).toBeTruthy();
    });

    it('closes an open panel through the menu and reopens it on the next visit', () => {
        renderMenuBar();
        openMenu('View');
        fireEvent.click(screen.getByRole('menuitem', { name: '✓ Properties' }));

        expect(visible('properties')).toBe(false);
        expect(visible('elements')).toBe(true);

        openMenu('View');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Properties' }));

        expect(visible('properties')).toBe(true);
    });

    it('shows a hidden panel again through the menu', () => {
        renderMenuBar();
        openMenu('View');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Macros' }));

        expect(visible('macros')).toBe(true);
    });

    it('restores the default layout', () => {
        useWorkspacePanelsStore.setState({ hidden: { assets: true, elements: true, properties: true, macros: false } });

        renderMenuBar();
        openMenu('View');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }));

        expect(visible('assets')).toBe(true);
        expect(visible('elements')).toBe(true);
        expect(visible('properties')).toBe(true);
        // Macros ships hidden in the default layout, so resetting leaves it hidden again.
        expect(visible('macros')).toBe(false);
    });
});

describe('MenuBar project name and save', () => {
    beforeEach(() => {
        resetLayout();
        vi.clearAllMocks();
    });

    it('shows the project name in the bar and renames it from there', () => {
        renderMenuBar();

        fireEvent.doubleClick(screen.getByText('Untitled'));
        const input = screen.getByLabelText('Project name');
        fireEvent.change(input, { target: { value: 'My Song' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(renameScene).toHaveBeenCalledWith('My Song');
    });

    it('saves and saves as from the scene options menu', () => {
        renderMenuBar();

        fireEvent.click(screen.getByRole('button', { name: 'Scene options' }));
        fireEvent.click(screen.getByText('Save'));

        fireEvent.click(screen.getByRole('button', { name: 'Scene options' }));
        fireEvent.click(screen.getByText('Save As…'));

        expect(saveToLocal).toHaveBeenCalledTimes(1);
        expect(saveAs).toHaveBeenCalledTimes(1);
    });
});

describe('MenuBar Help menu', () => {
    beforeEach(() => {
        resetLayout();
        vi.clearAllMocks();
    });

    it('routes help and controls from the Help menu', () => {
        const onHelp = vi.fn();
        const onControls = vi.fn();
        renderMenuBar({ onHelp, onControls });

        openMenu('Help');
        expect(screen.getByRole('menuitem', { name: /MVMNT v/ })).toBeDisabled();

        fireEvent.click(screen.getByRole('menuitem', { name: /Getting Started/ }));
        openMenu('Help');
        fireEvent.click(screen.getByRole('menuitem', { name: /Controls/ }));

        expect(onHelp).toHaveBeenCalledTimes(1);
        expect(onControls).toHaveBeenCalledTimes(1);
    });

    it('keeps community as its own top-bar button rather than a Help entry', () => {
        const onCommunity = vi.fn();
        renderMenuBar({ onCommunity });

        fireEvent.click(screen.getByRole('button', { name: 'Community' }));
        expect(onCommunity).toHaveBeenCalledTimes(1);

        openMenu('Help');
        expect(screen.queryByRole('menuitem', { name: /Community/ })).toBeNull();
    });
});
