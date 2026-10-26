import { FloatingFocusManager, FloatingOverlay, useFloating } from '@floating-ui/react';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { Button } from '@workspace/components/Button';

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
                    className="w-[380px] max-w-[90vw] rounded border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-200 "
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
                        <Button
                            variant="primary"
                            size="md"
                            disabled={busy}
                            onClick={onStart}
                            className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            {busy ? 'Loading tutorial…' : restarting ? 'Restart tutorial' : 'Try tutorial'}
                        </Button>
                        <Button variant="ghost" size="md" disabled={busy} onClick={onClose}>
                            Not now
                        </Button>
                    </div>
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
