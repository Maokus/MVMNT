import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingFontsBanner } from '@workspace/components/MissingFontsBanner';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

const { fetchGoogleFontCatalog, addGoogleFontFamilyToProject } = vi.hoisted(() => ({
    fetchGoogleFontCatalog: vi.fn(),
    addGoogleFontFamilyToProject: vi.fn(),
}));

vi.mock('@fonts/google-fonts-client', () => ({
    addGoogleFontFamilyToProject,
    fetchGoogleFontCatalog,
    hasGoogleFontsApiKey: () => true,
    readCachedGoogleFontCatalog: () => null,
}));

describe('MissingFontsBanner', () => {
    beforeEach(() => {
        fetchGoogleFontCatalog.mockReset();
        addGoogleFontFamilyToProject.mockReset();
        act(() => {
            useSceneStore.getState().clearScene();
            dispatchSceneCommand({
                type: 'addElement',
                elementType: 'textOverlay',
                elementId: 'missing-font',
                config: { fontFamily: 'MissingGoogle:Roboto|400' },
            });
            dispatchSceneCommand({
                type: 'createMacro',
                macroId: 'project-font',
                definition: { type: 'font', value: 'MissingProject:Brand Sans|400' },
            });
        });
    });

    it('retries every missing Google font with one click and excludes project fonts', async () => {
        const roboto = {
            family: 'Roboto',
            variants: ['regular'],
            files: { regular: 'https://fonts.gstatic.com/roboto' },
        };
        fetchGoogleFontCatalog.mockResolvedValue({ items: [roboto], fetchedAt: 1 });
        addGoogleFontFamilyToProject.mockResolvedValue({ id: 'roboto' });

        render(<MissingFontsBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'Retry 1 Google font' }));

        await waitFor(() => expect(addGoogleFontFamilyToProject).toHaveBeenCalledWith(roboto));
        expect(fetchGoogleFontCatalog).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Downloaded 1 font family.')).toBeInTheDocument();
    });
});
