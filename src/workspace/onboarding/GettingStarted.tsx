import { useEffect, useRef, useState } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import type { TutorialStep } from './useOnboarding';

interface GettingStartedProps {
    played: boolean;
    edited: boolean;
    midiImported: boolean;
    midiConnected: boolean;
    audioImported: boolean;
    saved: boolean;
    rendered: boolean;
    step: TutorialStep;
    onDismiss: () => void;
    revealProperties: () => void;
    revealTimeline: () => void;
}

export function GettingStarted({
    played,
    edited,
    midiImported,
    midiConnected,
    audioImported,
    saved,
    rendered,
    step,
    onDismiss,
    revealProperties,
    revealTimeline,
}: GettingStartedProps) {
    const [collapsed, setCollapsed] = useState(false);
    const headingButton = useRef<HTMLButtonElement>(null);
    const { clearSelection } = useSceneSelection();
    const midiReady = midiImported && midiConnected;
    const count =
        Number(played) + Number(edited) + Number(midiReady) + Number(audioImported) + Number(saved) + Number(rendered);
    const complete = count === 6;

    useEffect(() => {
        headingButton.current?.focus();
    }, []);
    useEffect(() => {
        if (step === 'edit-title' || step === 'connect-midi') {
            revealProperties();
            clearSelection();
            const frame = requestAnimationFrame(() => {
                const target = document.querySelector<HTMLElement>(`[data-tutorial-target="${step}"]`);
                target?.scrollIntoView({ block: 'nearest' });
                if (step === 'edit-title') target?.focus({ preventScroll: true });
            });
            return () => cancelAnimationFrame(frame);
        }
        if (step === 'play' || step === 'import-midi' || step === 'import-audio') revealTimeline();
        return undefined;
    }, [clearSelection, revealProperties, revealTimeline, step]);

    return (
        <section
            aria-label="Tutorial"
            className="m-2 flex-none rounded-xl border border-indigo-400/30 bg-neutral-900 text-neutral-100"
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
                <button
                    ref={headingButton}
                    type="button"
                    aria-expanded={!collapsed}
                    aria-controls="getting-started-steps"
                    onClick={() => setCollapsed(!collapsed)}
                    className="rounded text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                >
                    Tutorial · {count}/6{' '}
                    <span className="ml-1 text-xs text-neutral-400">{collapsed ? 'Expand' : 'Collapse'}</span>
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-white"
                    aria-label="Dismiss tutorial"
                >
                    Dismiss
                </button>
            </div>
            <p role="status" className="sr-only">
                {complete ? 'Tutorial complete. Your video is rendering.' : `${count} of 6 steps complete.`}
            </p>
            {!collapsed && (
                <div
                    id="getting-started-steps"
                    className="max-h-[35dvh] overflow-y-auto border-t border-neutral-700/60 px-3 py-3"
                >
                    {complete ? (
                        <>
                            <p className="text-sm font-medium">Tutorial complete!</p>
                            <p className="mt-1 text-xs leading-5 text-neutral-400">
                                Your project is saved and your video is rendering.
                            </p>
                        </>
                    ) : (
                        <ol className="space-y-3">
                            <li>
                                <p className="text-sm font-medium">{played ? '✓' : '1.'} Play the project</p>
                                {!played && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Press Space to play! You can also use the highlighted Play control.
                                    </p>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{edited ? '✓' : '2.'} Make it yours</p>
                                {played && !edited && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Enter your own text in the highlighted songTitle field.
                                    </p>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{midiReady ? '✓' : '3.'} Add your MIDI</p>
                                {step === 'import-midi' && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Choose your MIDI file with the highlighted MIDI import control.
                                    </p>
                                )}
                                {step === 'connect-midi' && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Select your imported track in the highlighted MIDITrack field to drive the
                                        visuals.
                                    </p>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{audioImported ? '✓' : '4.'} Add your audio</p>
                                {step === 'import-audio' && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Choose the matching audio file with the highlighted Audio import control.
                                    </p>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{saved ? '✓' : '5.'} Save your project</p>
                                {step === 'save' && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Press Ctrl/Cmd+S to save, or open the highlighted Scene options menu and choose
                                        Save.
                                    </p>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{rendered ? '✓' : '6.'} Render your video</p>
                                {step === 'render' && (
                                    <p className="mt-1 text-xs leading-5 text-neutral-300">
                                        Click the highlighted Render button, choose your settings, and start the render.
                                    </p>
                                )}
                            </li>
                        </ol>
                    )}
                </div>
            )}
        </section>
    );
}
