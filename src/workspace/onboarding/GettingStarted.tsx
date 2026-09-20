import { useEffect, useRef, useState } from 'react';
import { useScene } from '@context/SceneContext';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useTimelineStore } from '@state/timelineStore';

interface GettingStartedProps {
    played: boolean;
    edited: boolean;
    saved: boolean;
    onDismiss: () => void;
    revealProperties: () => void;
    revealTimeline: () => void;
    onRender: () => void;
}

const actionClass =
    'rounded border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:opacity-50';

export function GettingStarted({
    played,
    edited,
    saved,
    onDismiss,
    revealProperties,
    revealTimeline,
    onRender,
}: GettingStartedProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [showMusicHelp, setShowMusicHelp] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [focusTitle, setFocusTitle] = useState(0);
    const headingButton = useRef<HTMLButtonElement>(null);
    const { clearSelection } = useSceneSelection();
    const { saveToLocal } = useScene();
    const count = Number(played) + Number(edited) + Number(saved);
    const complete = count === 3;

    useEffect(() => {
        headingButton.current?.focus();
    }, []);
    useEffect(() => {
        if (!focusTitle) return;
        const frame = requestAnimationFrame(() => {
            const input = document.getElementById('macro-value-TITLE');
            input?.scrollIntoView({ block: 'nearest' });
            input?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [focusTitle]);

    const showTitle = () => {
        revealProperties();
        clearSelection();
        setFocusTitle((value) => value + 1);
    };
    const play = () => {
        revealTimeline();
        const timeline = useTimelineStore.getState();
        if (!timeline.transport.isPlaying) {
            timeline.seekTick(timeline.playbackRange?.startTick ?? timeline.timelineView.startTick);
            timeline.togglePlay();
        }
    };
    const save = async () => {
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            if (!(await saveToLocal())) setError('Your project was not saved. You can try again when you’re ready.');
        } catch {
            setError('Could not save your project. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section
            aria-label="Getting started"
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
                    Getting started · {count}/3{' '}
                    <span className="ml-1 text-xs text-neutral-400">{collapsed ? 'Expand' : 'Collapse'}</span>
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-white"
                    aria-label="Dismiss getting started"
                >
                    Dismiss
                </button>
            </div>
            <p role="status" className="sr-only">
                {complete ? 'Your first project is saved.' : `${count} of 3 steps complete.`}
            </p>
            {!collapsed && (
                <div
                    id="getting-started-steps"
                    className="max-h-[35dvh] overflow-y-auto border-t border-neutral-700/60 px-3 py-3"
                >
                    {complete ? (
                        <>
                            <p className="text-sm font-medium">Your first project is saved.</p>
                            <p className="mt-1 text-xs leading-5 text-neutral-400">
                                Keep experimenting, or take the next step.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" className={actionClass} onClick={onRender}>
                                    Render a video
                                </button>
                                <button
                                    type="button"
                                    className={actionClass}
                                    aria-expanded={showMusicHelp}
                                    onClick={() => setShowMusicHelp(!showMusicHelp)}
                                >
                                    Use your own music
                                </button>
                            </div>
                            {showMusicHelp && (
                                <div className="mt-3 text-xs leading-5 text-neutral-300">
                                    <ol className="list-decimal space-y-1 pl-4">
                                        <li>
                                            Import your MIDI file using the timeline’s MIDI import button, or drop it
                                            onto the timeline.
                                        </li>
                                        <li>
                                            Deselect scene elements to see Macros. Choose your imported MIDI tracks in
                                            MELODY, SUPPORT, and BASS to connect them to the visuals.
                                        </li>
                                        <li>
                                            Import matching audio, choose it in AUDIO, and mute or remove the demo audio
                                            before playback. MIDI drives visuals; the audio track supplies sound.
                                        </li>
                                    </ol>
                                </div>
                            )}
                        </>
                    ) : (
                        <ol className="space-y-3">
                            <li>
                                <p className="text-sm font-medium">{played ? '✓' : '1.'} Play the demo</p>
                                {!played && (
                                    <>
                                        <p className="mb-2 text-xs leading-5 text-neutral-400">
                                            MIDI drives the visuals. The audio track supplies the music.
                                        </p>
                                        <button type="button" className={actionClass} onClick={play}>
                                            Play demo
                                        </button>
                                    </>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{edited ? '✓' : '2.'} Make it yours</p>
                                {played && !edited && (
                                    <>
                                        <p className="mb-2 text-xs leading-5 text-neutral-400">
                                            Change TITLE to your own text. Macros are shared controls for the scene.
                                        </p>
                                        <button type="button" className={actionClass} onClick={showTitle}>
                                            Show title control
                                        </button>
                                    </>
                                )}
                            </li>
                            <li>
                                <p className="text-sm font-medium">{saved ? '✓' : '3.'} Save your project</p>
                                {played && edited && !saved && (
                                    <>
                                        <p className="mb-2 text-xs leading-5 text-neutral-400">
                                            Save an editable .mvt project. You can render a video later.
                                        </p>
                                        <button
                                            type="button"
                                            className={actionClass}
                                            disabled={saving}
                                            onClick={() => void save()}
                                        >
                                            {saving ? 'Saving…' : 'Save project'}
                                        </button>
                                    </>
                                )}
                            </li>
                        </ol>
                    )}
                    {error && (
                        <p role="alert" className="mt-2 text-xs text-red-300">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
