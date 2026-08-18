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
        <main className="min-h-screen bg-neutral-800 px-6 py-10 text-neutral-200">
            <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">My privacy promise</h1>
                        <p className="mt-2 text-sm text-neutral-400">
                            I built MVMNT to be useful without turning your projects into data.
                        </p>
                    </div>
                    <Link className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700" to="/">
                        Back to Home
                    </Link>
                </div>

                <div className="space-y-6 leading-7 text-neutral-300">
                    <section className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-lg font-semibold text-white">Your choice</h2>
                            <span className="text-xs text-neutral-500">Policy version {ANALYTICS_POLICY_VERSION}</span>
                        </div>
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

                    <div className="grid gap-4 md:grid-cols-2">
                        <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                            <h2 className="text-lg font-semibold text-emerald-100">
                                What I collect — only if you allow it
                            </h2>
                            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-300">
                                <li>App version, release channel, coarse platform, and runtime.</li>
                                <li>
                                    Successful workflow milestones, such as importing media or completing an export.
                                </li>
                                <li>Safe feature categories, Community actions, and export outcome categories.</li>
                                <li>Sanitized renderer error type, fatal state, and stack locations.</li>
                            </ul>
                        </section>
                        <section className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5">
                            <h2 className="text-lg font-semibold text-rose-100">What I never collect</h2>
                            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-300">
                                <li>Project names, filenames, paths, URLs, or free-form text.</li>
                                <li>MIDI, audio, image, font, plugin, or scene contents.</li>
                                <li>Email addresses, usernames, passwords, tokens, or secret keys.</li>
                                <li>
                                    Session replay, autocapture, heatmaps, console recording, or advertising tracking.
                                </li>
                            </ul>
                        </section>
                    </div>

                    <section className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-5">
                        <h2 className="text-lg font-semibold text-white">Identity, processor, and retention</h2>
                        <p className="mt-2">
                            I give anonymous use a random analytics identifier. If you sign in to Community after
                            consenting, I use only your Supabase account UUID to connect events; I never send your email
                            or username. PostHog processes these events in its EU Cloud for 12 months.
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

                    <section className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-5">
                        <h2 className="text-lg font-semibold text-white">Access and deletion</h2>
                        <p className="mt-2">
                            Withdrawing stops future collection and resets the local analytics identity; it does not
                            automatically erase earlier events. Contact me through{' '}
                            <a className="underline hover:text-white" href="https://maok.us" target="_blank">
                                maok.us
                            </a>{' '}
                            if you want to access or delete your data, and include the analytics identifier above when
                            available. If you use Community, you can instead verify the email attached to your account.
                            Please never send me a password or project file.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
