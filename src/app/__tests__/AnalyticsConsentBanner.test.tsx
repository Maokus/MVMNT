import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsConsentBanner } from '../AnalyticsConsentBanner';
import { ANALYTICS_CONSENT_STORAGE_KEY, getAnalyticsConsent } from '../analytics';

describe('AnalyticsConsentBanner', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('keeps PostHog unloaded when the user declines and hides the prompt', async () => {
        render(
            <MemoryRouter>
                <AnalyticsConsentBanner />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));

        await waitFor(() => expect(screen.queryByLabelText('Analytics choice')).not.toBeInTheDocument());
        expect(getAnalyticsConsent()).toBe('denied');
        expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toContain('"status":"denied"');
    });
});
