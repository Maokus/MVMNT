import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ANALYTICS_POLICY_VERSION, analytics } from '@app/analytics';
import { useAnalyticsConsent } from '@app/useAnalyticsConsent';

export function PrivacyPage() {
    const consent = useAnalyticsConsent();
    const [identifier, setIdentifier] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let active = true;
        if (consent !== 'granted') {
            setIdentifier(null);
            return;
        }
        void analytics.getIdentifier().then((value) => {
            if (active) setIdentifier(value);
        });
        return () => {
            active = false;
        };
    }, [consent]);

    const copyIdentifier = async () => {
        if (!identifier) return;
        await navigator.clipboard.writeText(identifier);
        setCopied(true);
    };

    return (
        <main className="min-h-screen bg-neutral-900 px-6 py-10 text-neutral-200">
            <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Privacy and analytics</h1>
                        <p className="mt-2 text-sm text-neutral-400">Policy version {ANALYTICS_POLICY_VERSION}</p>
                    </div>
                    <Link className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700" to="/">
                        Back to Home
                    </Link>
                </div>

                <div className="space-y-6 leading-7 text-neutral-300">
                    <section>
                        <h2 className="text-lg font-semibold text-white">Your choice</h2>
                        <p className="mt-2">
                            Analytics is optional and remains off until you allow it. Your current choice is{' '}
                            <strong className="text-white">{consent}</strong>.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                                disabled={consent === 'granted'}
                                onClick={() => void analytics.setConsent('granted')}
                            >
                                Allow analytics
                            </button>
                            <button
                                type="button"
                                className="rounded border border-neutral-600 px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
                                disabled={consent === 'denied'}
                                onClick={() => void analytics.setConsent('denied')}
                            >
                                Withdraw or decline
                            </button>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white">What is collected</h2>
                        <p className="mt-2">
                            MVMNT records coarse app version and platform information, successful workflow milestones,
                            feature categories, export outcomes, community actions, and sanitized renderer errors. It
                            does not use autocapture, heatmaps, session replay, console recording, or advertising
                            tracking.
                        </p>
                        <p className="mt-2">
                            Project names, filenames, file paths, MIDI/audio/image/font contents, free-form text, email
                            addresses, usernames, passwords, and secret keys are prohibited from analytics.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white">Identity, processor, and retention</h2>
                        <p className="mt-2">
                            Anonymous use receives a random analytics identifier. If you sign in to Community after
                            consenting, only your Supabase account UUID is used to connect events; email and username
                            are not sent. Events are processed by PostHog in its EU Cloud and retained for 12 months.
                        </p>
                        {identifier ? (
                            <div className="mt-3 rounded border border-neutral-700 bg-neutral-950 p-3 text-sm">
                                <p className="text-neutral-400">Analytics identifier</p>
                                <code className="mt-1 block break-all text-neutral-200">{identifier}</code>
                                <button className="mt-2 underline" type="button" onClick={() => void copyIdentifier()}>
                                    {copied ? 'Copied' : 'Copy identifier'}
                                </button>
                            </div>
                        ) : null}
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white">Access and deletion</h2>
                        <p className="mt-2">
                            Withdrawing stops future collection and resets the local analytics identity; it does not
                            automatically erase earlier events. To request access or deletion, contact the project owner
                            through{' '}
                            <a className="underline hover:text-white" href="https://maok.us" target="_blank">
                                maok.us
                            </a>{' '}
                            and include the analytics identifier above when available. Community users may instead
                            verify the email attached to their account. Never include a password or project file.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
