import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsConsentBanner } from '../AnalyticsConsentBanner';
import { ANALYTICS_CONSENT_STORAGE_KEY, analyticsTesting, getAnalyticsConsent } from '../analytics';

describe('AnalyticsConsentBanner', () => {
    beforeEach(() => {
        localStorage.clear();
        analyticsTesting.reset();
        vi.stubEnv('VITE_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
        vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
        vi.stubEnv('VITE_PUBLIC_POSTHOG_ENABLE_DEVELOPMENT', 'true');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('keeps PostHog unloaded when the user declines and hides the prompt', async () => {
        const loader = vi.fn(async () => {
            throw new Error('PostHog must not load');
        });
        analyticsTesting.setLoader(loader);
        render(
            <MemoryRouter>
                <AnalyticsConsentBanner />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));

        await waitFor(() => expect(screen.queryByLabelText('Analytics choice')).not.toBeInTheDocument());
        expect(getAnalyticsConsent()).toBe('denied');
        expect(loader).not.toHaveBeenCalled();
        expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toContain('"status":"denied"');
    });
});
