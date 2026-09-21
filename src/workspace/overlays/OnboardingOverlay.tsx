import { FloatingFocusManager, FloatingOverlay, useFloating } from '@floating-ui/react';
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
                    className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl sm:p-8"
                >
                    <h2 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
                        Would you like to try the tutorial?
                    </h2>
                    <p id="onboarding-description" className="mt-4 leading-7 text-neutral-300">
                        It opens a simple project and guides you through making your own music visualisation.
                    </p>
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-red-300">
                            {error}
                        </p>
                    )}
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onStart}
                            className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:opacity-60"
                        >
                            {busy ? 'Loading tutorial…' : restarting ? 'Restart tutorial' : 'Try tutorial'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-neutral-600 px-4 py-2.5 text-sm hover:bg-neutral-800 disabled:opacity-60"
                        >
                            Not now
                        </button>
                    </div>
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
