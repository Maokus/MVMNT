import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';
import { useDocumentSaveStatusStore } from '@state/documentSaveStatusStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { useTemplateApply } from '@workspace/templates/useTemplateApply';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import { rememberOnboarding, shouldShowWelcome } from './preferences';

interface TutorialSession {
    id: number;
    initialTitle: string;
    initialTrackIds: string[];
    played: boolean;
    edited: boolean;
    midiImported: boolean;
    midiConnected: boolean;
    importedMidiTrackIds: string[];
    audioImported: boolean;
    saved: boolean;
    rendered: boolean;
}

export type TutorialStep =
    'play' | 'edit-title' | 'import-midi' | 'connect-midi' | 'import-audio' | 'save' | 'render' | 'complete';

function getTutorialStep(session: TutorialSession | null): TutorialStep | null {
    if (!session) return null;
    if (!session.played) return 'play';
    if (!session.edited) return 'edit-title';
    if (!session.midiImported) return 'import-midi';
    if (!session.midiConnected) return 'connect-midi';
    if (!session.audioImported) return 'import-audio';
    if (!session.saved) return 'save';
    if (!session.rendered) return 'render';
    return 'complete';
}

export function useOnboarding({
    ready,
    suppressed,
    renderingVideo,
}: {
    ready: boolean;
    suppressed: boolean;
    renderingVideo: boolean;
}) {
    const [welcomeRequested, setWelcomeRequested] = useState(shouldShowWelcome);
    const [session, setSession] = useState<TutorialSession | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const loading = useRef(false);
    const nextSessionId = useRef(0);
    const mounted = useRef(true);
    const applyTemplate = useTemplateApply();

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Subscribe only for the active tutorial. Loading, opening, or creating another
    // document ends the guide rather than carrying progress into unrelated work.
    useEffect(() => {
        if (!session) return;
        const initialTitle = session.initialTitle;
        const metadata = useSceneMetadataStore.getState().metadata;
        const stop = () => setSession(null);
        const unsubscribers = [
            useSceneMetadataStore.subscribe((state) => {
                if (state.metadata.id !== metadata.id || state.metadata.createdAt !== metadata.createdAt) stop();
            }),
            useSceneEditorStore.subscribe((state, previous) => {
                if (state.hydrationRevision !== previous.hydrationRevision) stop();
            }),
            useTemplateStatusStore.subscribe((state) => {
                if (state.isTemplateLoading) stop();
            }),
            useTimelineStore.subscribe((state, previous) => {
                if (
                    state.transport.isPlaying &&
                    previous.transport.isPlaying &&
                    state.timeline.currentTick !== previous.timeline.currentTick
                ) {
                    setSession((current) => (current && !current.played ? { ...current, played: true } : current));
                }
                setSession((current) => {
                    if (!current) return current;
                    const importedTrackIds = state.tracksOrder.filter(
                        (trackId) => !current.initialTrackIds.includes(trackId)
                    );
                    const importedMidiTrackIds = importedTrackIds.filter(
                        (trackId) => state.tracks[trackId]?.type === 'midi'
                    );
                    const audioImported = importedTrackIds.some((trackId) => state.tracks[trackId]?.type === 'audio');
                    if (
                        importedMidiTrackIds.join() === current.importedMidiTrackIds.join() &&
                        audioImported === current.audioImported
                    ) {
                        return current;
                    }
                    return {
                        ...current,
                        importedMidiTrackIds,
                        midiImported: importedMidiTrackIds.length > 0,
                        midiConnected: importedMidiTrackIds.includes(
                            String(useSceneStore.getState().macros.byId.MIDITrack?.value)
                        ),
                        audioImported,
                        saved: false,
                        rendered: false,
                    };
                });
            }),
            useSceneStore.subscribe((state, previous) => {
                const title = state.macros.byId.songTitle?.value;
                const midiTrackId = state.macros.byId.MIDITrack?.value;
                if (
                    title === previous.macros.byId.songTitle?.value &&
                    midiTrackId === previous.macros.byId.MIDITrack?.value
                )
                    return;
                if (typeof title !== 'string') {
                    stop();
                    return;
                }
                setSession((current) => {
                    if (!current) return current;
                    const edited = Boolean(title.trim()) && title !== initialTitle;
                    const midiConnected = current.importedMidiTrackIds.includes(String(midiTrackId));
                    return { ...current, edited, midiConnected, saved: false, rendered: false };
                });
            }),
            useDocumentSaveStatusStore.subscribe((state, previous) => {
                if (state.successfulSave === previous.successfulSave || !state.successfulSave) return;
                if (state.successfulSave.revision !== useDocumentRevisionStore.getState().revision) return;
                setSession((current) =>
                    current?.edited && current.midiConnected && current.audioImported
                        ? { ...current, saved: true }
                        : current
                );
            }),
        ];
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
        // Step changes must not replace the subscriptions or their document baseline.
    }, [session?.id]);

    useEffect(() => {
        if (!renderingVideo) return;
        setSession((current) => (current?.saved ? { ...current, rendered: true } : current));
    }, [renderingVideo]);

    const complete = Boolean(
        session?.played &&
        session.edited &&
        session.midiConnected &&
        session.audioImported &&
        session.saved &&
        session.rendered
    );
    useEffect(() => {
        if (complete) rememberOnboarding('completed');
    }, [complete]);

    const startTutorial = async () => {
        if (loading.current || suppressed || !ready) return;
        loading.current = true;
        setBusy(true);
        setError('');
        try {
            const template = easyModeTemplates.find((candidate) => candidate.id === 'kashiwadelike');
            if (!template) throw new Error('The tutorial is unavailable. You can continue with your project.');
            if (!(await applyTemplate(template))) return;
            if (!mounted.current) return;
            useTimelineStore.getState().pause();
            const title = useSceneStore.getState().macros.byId.songTitle?.value;
            if (typeof title !== 'string')
                throw new Error('The tutorial title control is unavailable. Please try again.');
            setSession({
                id: ++nextSessionId.current,
                initialTitle: title,
                initialTrackIds: [...useTimelineStore.getState().tracksOrder],
                played: false,
                edited: false,
                midiImported: false,
                midiConnected: false,
                importedMidiTrackIds: [],
                audioImported: false,
                saved: false,
                rendered: false,
            });
            rememberOnboarding('started');
            setWelcomeRequested(false);
        } catch (cause) {
            if (mounted.current)
                setError(cause instanceof Error ? cause.message : 'Could not load the tutorial. Please try again.');
        } finally {
            loading.current = false;
            if (mounted.current) setBusy(false);
        }
    };

    return {
        showWelcome: welcomeRequested && !suppressed && (ready || busy),
        session,
        busy,
        error,
        complete,
        step: getTutorialStep(session),
        startTutorial,
        openWelcome: () => {
            setError('');
            setWelcomeRequested(true);
        },
        closeWelcome: () => {
            if (loading.current) return;
            rememberOnboarding('dismissed');
            setWelcomeRequested(false);
        },
        dismissGuide: () => {
            rememberOnboarding(complete ? 'completed' : 'dismissed');
            setSession(null);
        },
    };
}
