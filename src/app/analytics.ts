import { BUILD_INFO } from './build-info';
import type { BuildChannel } from '../../electron/shared/build-info';
import {
    ANALYTICS_CONSENT_STORAGE_KEY,
    ANALYTICS_POLICY_VERSION,
    type AnalyticsContext,
    type AnalyticsEventMap,
    type AnalyticsEventName,
    type AnalyticsService,
} from './analytics/contracts';
import {
    completePendingDocumentAnalytics as completePendingDocumentAnalyticsWith,
    failPendingDocumentAnalytics as failPendingDocumentAnalyticsWith,
    stagePendingDocumentAnalytics,
    type PendingDocumentAnalytics,
} from './analytics/document-lifecycle';
import { createPostHogProvider } from './analytics/posthog-provider';
import { createAnalyticsService } from './analytics/service';

export function analyticsEnabledForBuild(
    channel: BuildChannel,
    token: string | undefined,
    host: string | undefined,
    developmentEnabled: string | undefined
): boolean {
    if (!token || !host) return false;
    return channel !== 'development' || developmentEnabled === 'true';
}

function analyticsConfigured(): boolean {
    return analyticsEnabledForBuild(
        BUILD_INFO.channel,
        import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN,
        import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        import.meta.env.VITE_PUBLIC_POSTHOG_ENABLE_DEVELOPMENT
    );
}

function coarsePlatform(): AnalyticsContext['platform'] {
    const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux')) return 'linux';
    return 'other';
}

function analyticsContext(): AnalyticsContext {
    return {
        app_version: BUILD_INFO.version,
        app_release_line: BUILD_INFO.releaseLine,
        build_channel: BUILD_INFO.channel,
        build_commit: BUILD_INFO.commit,
        runtime: window.mvmntDesktop ? 'desktop' : 'browser',
        platform: coarsePlatform(),
        consent_policy_version: ANALYTICS_POLICY_VERSION,
    };
}

export const analytics: AnalyticsService = createAnalyticsService({
    isEnabled: analyticsConfigured,
    context: analyticsContext,
    providerFactory: async () =>
        createPostHogProvider({
            token: import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN!,
            host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST!,
        }),
});

export const initializeAnalytics = () => analytics.initialize();
export const getAnalyticsConsent = () => analytics.getConsent();
export const subscribeToAnalyticsConsent = (listener: () => void) => analytics.subscribeToConsent(listener);
export const identifyAnalyticsUser = (accountId: string) => analytics.identify(accountId);
export const resetAnalyticsIdentity = () => analytics.reset();
export const setAnalyticsConsent = (status: 'granted' | 'denied') => analytics.setConsent(status);
export const getAnalyticsIdentifier = () => analytics.getIdentifier();
export const captureAnalytics = <K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]) =>
    analytics.capture(event, properties);
export const captureAnalyticsMilestone = <K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]) =>
    analytics.captureMilestone(event, properties);

export { ANALYTICS_CONSENT_STORAGE_KEY, ANALYTICS_POLICY_VERSION, stagePendingDocumentAnalytics };
export type { AnalyticsEventMap, PendingDocumentAnalytics };

export const completePendingDocumentAnalytics = () => completePendingDocumentAnalyticsWith(analytics);
export const failPendingDocumentAnalytics = () => failPendingDocumentAnalyticsWith(analytics);
