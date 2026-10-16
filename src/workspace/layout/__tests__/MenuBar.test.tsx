import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspacePanelsStore } from '@state/workspacePanelsStore';
import MenuBar from '../MenuBar';

vi.mock('@context/SceneContext', () => ({
    useScene: () => ({
        sceneName: 'Untitled',
        renameScene: vi.fn().mockResolvedValue(true),
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

const panelButton = (name: string) => screen.getByRole('button', { name });

const renderMenuBar = () =>
    render(
        <MemoryRouter>
            <MenuBar />
        </MemoryRouter>
    );

describe('MenuBar panel toggles', () => {
    beforeEach(resetLayout);

    it('lights up every panel the docks are showing, including background tabs', () => {
        renderMenuBar();

        expect(panelButton('Assets')).toHaveAttribute('aria-pressed', 'true');
        expect(panelButton('Elements')).toHaveAttribute('aria-pressed', 'true');
        expect(panelButton('Properties')).toHaveAttribute('aria-pressed', 'true');
        expect(panelButton('Macros')).toHaveAttribute('aria-pressed', 'false');
    });

    it('closes an open panel on one click and reopens it on the next', () => {
        renderMenuBar();

        fireEvent.click(panelButton('Properties'));
        expect(panelButton('Properties')).toHaveAttribute('aria-pressed', 'false');
        expect(panelButton('Elements')).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(panelButton('Properties'));
        expect(panelButton('Properties')).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows a hidden panel again on one click', () => {
        renderMenuBar();

        fireEvent.click(panelButton('Macros'));
        expect(panelButton('Macros')).toHaveAttribute('aria-pressed', 'true');
    });
});
