import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutPage from '../AboutPage';
import HomePage from '../HomePage';

vi.mock('@app/build-info', () => ({
    BUILD_INFO: {
        version: '0.16.0',
        releaseLine: '0.16.0',
        displayVersion: '0.16.0',
        channel: 'stable',
        commit: '61ed441360d49f9647c975afed40ef920c2c93b4',
        builtAt: '2026-08-12T00:00:00Z',
        isPackaged: true,
        updateChecksEnabled: true,
    },
}));

vi.mock('@workspace/templates/easyModeTemplates', () => ({ easyModeTemplates: [] }));

vi.mock('@persistence/local-save-service', () => ({
    LocalSaveService: { hasSavedFile: vi.fn().mockResolvedValue(true) },
}));

afterEach(() => {
    Object.defineProperty(window, 'mvmntDesktop', { configurable: true, value: undefined });
});

describe('version pages', () => {
    it('keeps new documents separate from the explicit autosave recovery action', async () => {
        const LocationState = () => {
            const location = useLocation();
            return <output>{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>;
        };

        render(
            <MemoryRouter>
                <HomePage />
                <LocationState />
            </MemoryRouter>
        );

        const recoverButton = await screen.findByRole('button', { name: 'RECOVER AUTOSAVE' });
        await waitFor(() => expect(recoverButton).toBeEnabled());
        fireEvent.click(recoverButton);
        await waitFor(() =>
            expect(screen.getByText('{"pathname":"/workspace","state":{"restoreAutosave":true}}')).toBeInTheDocument()
        );

        fireEvent.click(screen.getByRole('button', { name: 'NEW DOCUMENT' }));
        await waitFor(() =>
            expect(
                screen.getByText('{"pathname":"/workspace","state":{"template":"blank","desktopNew":true}}')
            ).toBeInTheDocument()
        );
    });

    it('shows detailed stable build information on About', () => {
        render(
            <MemoryRouter>
                <AboutPage />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { name: 'MVMNT v0.16.0' })).toBeInTheDocument();
        expect(screen.getByText('Stable')).toBeInTheDocument();
        expect(screen.getByText('61ed441360d49f9647c975afed40ef920c2c93b4')).toBeInTheDocument();
        expect(screen.getByText(/updates are downloaded manually/i)).toBeInTheDocument();
    });

    it('shows a safe download action when GitHub reports a newer stable release', async () => {
        const openHttps = vi.fn().mockResolvedValue(true);
        Object.defineProperty(window, 'mvmntDesktop', {
            configurable: true,
            value: {
                documents: { listRecent: vi.fn().mockResolvedValue([]) },
                app: {
                    checkForUpdates: vi.fn().mockResolvedValue({
                        status: 'available',
                        latestVersion: '0.17.0',
                        downloadUrl: 'https://github.com/Maokus/MVMNT/releases/latest',
                    }),
                },
                external: { openHttps },
            },
        });

        render(
            <MemoryRouter>
                <HomePage />
            </MemoryRouter>
        );

        expect(await screen.findByText('MVMNT v0.17.0 is available.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));
        await waitFor(() => expect(openHttps).toHaveBeenCalledWith('https://github.com/Maokus/MVMNT/releases/latest'));
    });
});
