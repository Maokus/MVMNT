import { FloatingFocusManager, FloatingOverlay, useFloating } from '@floating-ui/react';
import { Link } from 'react-router-dom';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';

interface OnboardingOverlayProps {
    onClose: () => void;
    onStart: () => void;
    busy: boolean;
    error: string;
    restarting: boolean;
}

export function OnboardingOverlay({ onClose, onStart, busy, error, restarting }: OnboardingOverlayProps) {
    const { refs, context } = useFloating({
        open: true,
        onOpenChange: (open) => {
            if (!open && !busy) onClose();
        },
    });
    useGlobalShortcut({
        id: 'modal.onboarding',
        domain: 'modal',
        matches: () => true,
        handle: (event) => {
            // Claim registry keys while retaining native input, button, and
            // focus-manager behavior inside the dialog.
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!busy) onClose();
            }
            if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'n', 'z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
            return true;
        },
    });

    return (
        <FloatingOverlay lockScroll className="z-[9000] flex items-center justify-center bg-black/80 p-4">
            <FloatingFocusManager context={context} outsideElementsInert returnFocus>
                <section
                    ref={refs.setFloating}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="onboarding-title"
                    aria-describedby="onboarding-description"
                    aria-busy={busy}
                    className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl sm:p-9"
                >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
                        Welcome to MVMNT
                    </p>
                    <h2 id="onboarding-title" className="text-3xl font-semibold tracking-tight">
                        Make music move
                    </h2>
                    <p id="onboarding-description" className="mt-4 leading-7 text-neutral-300">
                        Explore a ready-made visualisation, make it yours, and save your first project.
                    </p>
                    <ol aria-label="Your first project" className="my-6 grid grid-cols-3 gap-3 text-sm">
                        {['Play', 'Edit', 'Save'].map((step, index) => (
                            <li key={step} className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
                                <span className="mb-2 block text-xs text-indigo-300">0{index + 1}</span>
                                {step}
                            </li>
                        ))}
                    </ol>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onStart}
                        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:opacity-60"
                    >
                        {busy ? 'Loading demo…' : restarting ? 'Restart the demo' : 'Try the demo'}
                    </button>
                    <p className="mt-2 text-center text-xs leading-5 text-neutral-400">
                        Opens an editable example with music and MIDI already connected. Playback starts when you press
                        Play.
                    </p>
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-red-300">
                            {error}
                        </p>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="mt-4 w-full rounded-lg border border-neutral-600 px-4 py-2.5 text-sm hover:bg-neutral-800 disabled:opacity-60"
                    >
                        Continue with this project
                    </button>
                    <footer className="mt-6 flex justify-center gap-5 text-xs text-neutral-400">
                        <Link
                            to="/about"
                            onClick={(event) => {
                                if (busy) event.preventDefault();
                                else onClose();
                            }}
                            aria-disabled={busy}
                            className="underline hover:text-white"
                        >
                            About MVMNT
                        </Link>
                        <a
                            href="https://maok.us/discord"
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-white"
                        >
                            Join the Discord
                        </a>
                    </footer>
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
