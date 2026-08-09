import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addGoogleFontFamilyToProject, fetchGoogleFontCatalog } = vi.hoisted(() => ({
    addGoogleFontFamilyToProject: vi.fn(),
    fetchGoogleFontCatalog: vi.fn(),
}));

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({ visualizer: null }),
}));

vi.mock('@fonts/google-fonts-client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@fonts/google-fonts-client')>()),
    addGoogleFontFamilyToProject,
    fetchGoogleFontCatalog,
    hasGoogleFontsApiKey: () => true,
    readCachedGoogleFontCatalog: () => null,
}));

import FontInput from '../FontInput';

describe('FontInput source separation', () => {
    beforeEach(() => {
        addGoogleFontFamilyToProject.mockReset();
        fetchGoogleFontCatalog.mockReset();
        fetchGoogleFontCatalog.mockResolvedValue({
            fetchedAt: 1,
            items: [
                {
                    family: 'Remote Sans',
                    variants: ['regular', '700'],
                    files: {
                        regular: 'https://fonts.gstatic.com/regular.woff2',
                        700: 'https://fonts.gstatic.com/700.woff2',
                    },
                },
            ],
        });
    });

    it('groups font sources and commits a Google selection only after embedding completes', async () => {
        let resolveDownload!: (asset: any) => void;
        addGoogleFontFamilyToProject.mockReturnValue(
            new Promise((resolve) => {
                resolveDownload = resolve;
            })
        );
        const onChange = vi.fn();
        render(
            <FontInput
                id="font"
                value="BuiltIn:inter|400"
                schema={{ default: 'BuiltIn:inter|400' }}
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Inter.*built-in/i }));
        expect(await screen.findByText('Project Fonts · embedded')).toBeInTheDocument();
        expect(screen.getByText('Project Fonts · embedded').closest('[data-preserve-selection="true"]')).not.toBeNull();
        expect(screen.getByText('Built-in Fonts · offline')).toBeInTheDocument();
        expect(screen.getByText('Device Fonts · not portable')).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('button', { name: /Remote Sans/i }));
        expect(onChange).not.toHaveBeenCalled();

        resolveDownload({
            id: 'remote-sans',
            family: 'Remote Sans',
            source: 'google',
            variants: [{ id: '400-normal', weight: 400, style: 'normal', sourceFormat: 'woff2' }],
        });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('Project:remote-sans|400'));
    });
});
