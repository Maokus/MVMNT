import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import pfp from '@assets/Logo_Pfp_white.png';
import { analytics } from './analytics';
import {
    ANALYTICS_DIALOGUE_TREE,
    SUPPORT_NOTICE_COPY,
    analyticsDialogueNodeForImpressions,
} from './analytics-dialogue-tree';
import {
    dismissAnalyticsPromptForSession,
    getNextAnalyticsPromptImpression,
    getNextAppOpenCount,
    hasShownAnalyticsPromptThisSession,
    hideAnalyticsPrompt,
    isAnalyticsPromptDismissedForSession,
    isAnalyticsPromptHidden,
    recordAnalyticsPromptImpression,
    recordAppOpen,
} from './home-notice-storage';
import { useAnalyticsConsent } from './useAnalyticsConsent';

export function AnalyticsConsentBanner() {
    const consent = useAnalyticsConsent();
    const { pathname } = useLocation();
    const [appOpenCount, setAppOpenCount] = useState(getNextAppOpenCount);
    const [promptImpressions, setPromptImpressions] = useState(getNextAnalyticsPromptImpression);
    const [dismissedForSession, setDismissedForSession] = useState(isAnalyticsPromptDismissedForSession);
    const [dismissStep, setDismissStep] = useState(false);
    const [doNotShowAgain, setDoNotShowAgain] = useState(false);

    useEffect(() => {
        setAppOpenCount(recordAppOpen());
    }, []);

    const showAnalyticsRequest =
        pathname === '/' && consent === 'unknown' && !isAnalyticsPromptHidden() && !dismissedForSession;

    useEffect(() => {
        if (showAnalyticsRequest) setPromptImpressions(recordAnalyticsPromptImpression());
    }, [showAnalyticsRequest]);

    const allowAnalytics = () => void analytics.setConsent('granted');
    const dismissAnalytics = () => {
        if (!dismissStep) {
            setDismissStep(true);
            return;
        }
        if (doNotShowAgain) hideAnalyticsPrompt();
        else dismissAnalyticsPromptForSession();
        setDismissedForSession(true);
    };

    if (showAnalyticsRequest) {
        const node =
            ANALYTICS_DIALOGUE_TREE[dismissStep ? 'dismissed' : analyticsDialogueNodeForImpressions(promptImpressions)];

        return (
            <HomeNotice ariaLabel="Analytics choice">
                <p className="text-sm font-semibold">{node.title}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-300">
                    {node.body}{' '}
                    <Link className="underline hover:text-white" to="/privacy">
                        See exactly what I collect
                    </Link>
                    .
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
                    <input
                        type="checkbox"
                        checked={doNotShowAgain}
                        onChange={(event) => setDoNotShowAgain(event.target.checked)}
                    />
                    Do not show again
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500"
                        onClick={allowAnalytics}
                    >
                        Allow
                    </button>
                    <button
                        type="button"
                        className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
                        onClick={dismissAnalytics}
                    >
                        {dismissStep ? 'Not now' : 'Dismiss'}
                    </button>
                </div>
            </HomeNotice>
        );
    }

    const supportMessage =
        appOpenCount > 50
            ? SUPPORT_NOTICE_COPY.frequentUserBody.replace('{count}', String(appOpenCount))
            : SUPPORT_NOTICE_COPY.body;

    return pathname === '/' && !hasShownAnalyticsPromptThisSession() ? (
        <SupportNotice message={supportMessage} />
    ) : null;
}

function HomeNotice({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
    return (
        <aside aria-label={ariaLabel} className="fixed bottom-4 right-4 z-[12000] flex items-end gap-2">
            <div className="relative">
                <div className="max-w-xs rounded-lg border border-neutral-800 bg-neutral-900/85 p-3 text-neutral-100 shadow-lg backdrop-blur-sm">
                    {children}
                </div>
                <div
                    className="absolute -right-2 bottom-3 h-3 w-3 rotate-45 border border-neutral-800 bg-neutral-900/85"
                    aria-hidden="true"
                />
            </div>
            <img
                src={pfp}
                alt="Maokus avatar"
                className="h-10 w-10 rounded-full border-2 border-neutral-800 object-cover"
            />
        </aside>
    );
}

function SupportNotice({ message }: { message: string }) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <HomeNotice ariaLabel="Support MVMNT">
            <p className="text-sm font-semibold">{SUPPORT_NOTICE_COPY.title}</p>
            <p className="mt-1 text-xs leading-5 text-neutral-300">{message}</p>
            <div className="mt-3 flex gap-2">
                <Link to="/contribute" className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500">
                    Support MVMNT
                </Link>
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
                >
                    Dismiss
                </button>
            </div>
        </HomeNotice>
    );
}
