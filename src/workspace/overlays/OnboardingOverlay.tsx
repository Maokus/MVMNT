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
        <FloatingOverlay lockScroll className="z-[9000] flex items-center justify-center bg-black/60 p-4">
            <FloatingFocusManager context={context} outsideElementsInert returnFocus>
                <section
                    ref={refs.setFloating}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="onboarding-title"
                    aria-describedby="onboarding-description"
                    aria-busy={busy}
                    className="w-[380px] max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl"
                >
                    <h2 id="onboarding-title" className="m-0 text-lg font-semibold text-white">
                        Would you like to try the tutorial?
                    </h2>
                    <p id="onboarding-description" className="m-0 mt-3 text-[13px] leading-relaxed text-neutral-400">
                        It opens a simple project and guides you through making your own music visualisation.
                    </p>
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-red-300">
                            {error}
                        </p>
                    )}
                    <div className="mt-5 flex flex-row-reverse justify-start gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onStart}
                            className="rounded bg-blue-500 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:opacity-60"
                        >
                            {busy ? 'Loading tutorial…' : restarting ? 'Restart tutorial' : 'Try tutorial'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onClose}
                            className="rounded border border-transparent px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
                        >
                            Not now
                        </button>
                    </div>
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
