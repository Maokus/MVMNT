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

interface DemoSession {
    id: number;
    initialTitle: string;
    played: boolean;
    edited: boolean;
    saved: boolean;
}

export function useOnboarding({ ready, suppressed }: { ready: boolean; suppressed: boolean }) {
    const [welcomeRequested, setWelcomeRequested] = useState(shouldShowWelcome);
    const [session, setSession] = useState<DemoSession | null>(null);
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

    // Subscribe only for the active demo. Loading, opening, or creating another
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
            }),
            useSceneStore.subscribe((state, previous) => {
                const title = state.macros.byId.TITLE?.value;
                if (title === previous.macros.byId.TITLE?.value) return;
                if (typeof title !== 'string') {
                    stop();
                    return;
                }
                setSession((current) =>
                    current && !(current.played && current.edited && current.saved)
                        ? { ...current, edited: Boolean(title.trim()) && title !== initialTitle, saved: false }
                        : current
                );
            }),
            useDocumentSaveStatusStore.subscribe((state, previous) => {
                if (state.successfulSave === previous.successfulSave || !state.successfulSave) return;
                if (state.successfulSave.revision !== useDocumentRevisionStore.getState().revision) return;
                setSession((current) => (current?.edited ? { ...current, saved: true } : current));
            }),
        ];
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
        // Step changes must not replace the subscriptions or their document baseline.
    }, [session?.id]);

    const complete = Boolean(session?.played && session.edited && session.saved);
    useEffect(() => {
        if (complete) rememberOnboarding('completed');
    }, [complete]);

    const startDemo = async () => {
        if (loading.current || suppressed || !ready) return;
        loading.current = true;
        setBusy(true);
        setError('');
        try {
            const template = easyModeTemplates.find((candidate) => candidate.id === 'default');
            if (!template) throw new Error('The demo is unavailable. You can continue with your project.');
            if (!(await applyTemplate(template))) return;
            if (!mounted.current) return;
            useTimelineStore.getState().pause();
            const title = useSceneStore.getState().macros.byId.TITLE?.value;
            if (typeof title !== 'string') throw new Error('The demo title control is unavailable. Please try again.');
            setSession({
                id: ++nextSessionId.current,
                initialTitle: title,
                played: false,
                edited: false,
                saved: false,
            });
            rememberOnboarding('started');
            setWelcomeRequested(false);
        } catch (cause) {
            if (mounted.current)
                setError(cause instanceof Error ? cause.message : 'Could not load the demo. Please try again.');
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
        startDemo,
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
