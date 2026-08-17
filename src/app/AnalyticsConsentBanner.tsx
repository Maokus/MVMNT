import React from 'react';
import { Link } from 'react-router-dom';
import { analytics } from './analytics';
import { useAnalyticsConsent } from './useAnalyticsConsent';

export function AnalyticsConsentBanner() {
    const consent = useAnalyticsConsent();
    if (consent !== 'unknown') return null;

    return (
        <aside
            aria-label="Analytics choice"
            className="fixed bottom-4 left-1/2 z-[12000] w-[min(94vw,42rem)] -translate-x-1/2 rounded-xl border border-neutral-600 bg-neutral-950/95 p-4 text-neutral-100 shadow-2xl backdrop-blur"
        >
            <p className="text-sm font-semibold">Help improve MVMNT?</p>
            <p className="mt-1 text-xs leading-5 text-neutral-300">
                With your permission, MVMNT sends privacy-minimized product usage and error diagnostics to PostHog's EU
                service. It never sends project names, filenames, media, or account contact details.{' '}
                <Link className="underline hover:text-white" to="/privacy">
                    Read the privacy details
                </Link>
                .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
                    onClick={() => void analytics.setConsent('granted')}
                >
                    Allow analytics
                </button>
                <button
                    type="button"
                    className="rounded border border-neutral-600 px-4 py-2 text-sm font-medium hover:bg-neutral-800"
                    onClick={() => void analytics.setConsent('denied')}
                >
                    No thanks
                </button>
            </div>
        </aside>
    );
}
