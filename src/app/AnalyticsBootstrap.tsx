import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sceneElementRegistry } from '@core/scene/registry';
import { registerSceneCommandListener } from '@state/scene';
import { registerTimelineCommandListener } from '@state/timeline';
import { useTimelineStore } from '@state/timelineStore';
import { analytics, completePendingDocumentAnalytics } from './analytics';
import { useAnalyticsConsent } from './useAnalyticsConsent';

const screens = {
    '/': 'home',
    '/workspace': 'workspace',
    '/about': 'about',
    '/privacy': 'privacy',
    '/changelog': 'changelog',
    '/community': 'community',
    '/contribute': 'contribute',
} as const;

export function AnalyticsBootstrap() {
    const location = useLocation();
    const consent = useAnalyticsConsent();

    useEffect(() => {
        if (consent !== 'granted') return;
        void analytics.initialize();
        const screen = screens[location.pathname as keyof typeof screens];
        if (screen) void analytics.capture('screen_viewed', { screen });
    }, [consent, location.pathname]);

    useEffect(() => {
        const unregisterScene = registerSceneCommandListener((event) => {
            if (!event.success || event.transient || event.command.type !== 'addElement') return;
            const elementType = sceneElementRegistry.isBuiltIn(event.command.elementType)
                ? event.command.elementType
                : 'plugin';
            void analytics.captureMilestone('scene_element_added', { element_type: elementType });
        });
        const unregisterTimeline = registerTimelineCommandListener((event) => {
            if (!event.success || event.transient || event.commandId !== 'timeline.addTrack') return;
            const trackId = (event.result as { trackId?: unknown } | undefined)?.trackId;
            if (typeof trackId !== 'string') return;
            const type = useTimelineStore.getState().tracks[trackId]?.type;
            if (type === 'audio' || type === 'midi') {
                void analytics.captureMilestone('media_imported', { media_type: type });
            }
        });
        let wasPlaying = useTimelineStore.getState().transport.isPlaying;
        const unregisterPlayback = useTimelineStore.subscribe((state) => {
            const isPlaying = state.transport.isPlaying;
            if (!wasPlaying && isPlaying) void analytics.captureMilestone('playback_started', {});
            wasPlaying = isPlaying;
        });
        const documentReady = () => void completePendingDocumentAnalytics();
        window.addEventListener('mvmnt-project-imported', documentReady);
        return () => {
            unregisterScene();
            unregisterTimeline();
            unregisterPlayback();
            window.removeEventListener('mvmnt-project-imported', documentReady);
        };
    }, []);

    return null;
}
