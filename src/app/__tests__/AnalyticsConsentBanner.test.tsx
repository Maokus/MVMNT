import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsConsentBanner } from '../AnalyticsConsentBanner';
import { getAnalyticsConsent } from '../analytics';

describe('AnalyticsConsentBanner', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps consent undecided while the dismiss conversation can be permanently hidden', async () => {
        render(
            <MemoryRouter>
                <AnalyticsConsentBanner />
            </MemoryRouter>
        );

        expect(await screen.findByText('Help me improve MVMNT?')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.getByText('Pretty please??')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Do not show again' }));
        fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

        await waitFor(() => expect(screen.queryByLabelText('Analytics choice')).not.toBeInTheDocument());
        expect(getAnalyticsConsent()).toBe('unknown');
        expect(localStorage.getItem('mvmnt.analytics-prompt-hidden.v1')).toBe('true');
        expect(screen.getByLabelText('Support MVMNT')).toBeInTheDocument();
    });

    it('shows the higher-engagement support request after the fifty-first app open', async () => {
        localStorage.setItem('mvmnt.app-open-count.v1', '50');
        localStorage.setItem('mvmnt.analytics-prompt-hidden.v1', 'true');

        render(
            <MemoryRouter>
                <AnalyticsConsentBanner />
            </MemoryRouter>
        );

        expect(
            await screen.findByText(
                "You've opened MVMNT 51 times. If you enjoy the app, please check out how you can support it!"
            )
        ).toBeInTheDocument();
    });
});
