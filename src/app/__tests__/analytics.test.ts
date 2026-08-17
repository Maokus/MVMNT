import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ANALYTICS_CONSENT_STORAGE_KEY,
    ANALYTICS_POLICY_VERSION,
    analyticsTesting,
    captureAnalytics,
    completePendingDocumentAnalytics,
    failPendingDocumentAnalytics,
    getAnalyticsConsent,
    identifyAnalyticsUser,
    sanitizePostHogEvent,
    setAnalyticsConsent,
    stagePendingDocumentAnalytics,
} from '../analytics';

function createClient() {
    return {
        init: vi.fn(),
        capture: vi.fn(),
        identify: vi.fn(),
        reset: vi.fn(),
        opt_in_capturing: vi.fn(),
        opt_out_capturing: vi.fn(),
        get_distinct_id: vi.fn(() => 'anonymous-id'),
        register: vi.fn(),
    };
}

describe('privacy-first analytics', () => {
    const accountId = '123e4567-e89b-42d3-a456-426614174000';

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        analyticsTesting.reset();
        vi.stubEnv('VITE_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
        vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
        vi.stubEnv('VITE_PUBLIC_POSTHOG_ENABLE_DEVELOPMENT', 'true');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('does not load PostHog or capture before explicit consent', async () => {
        const loader = vi.fn(async () => createClient());
        analyticsTesting.setLoader(loader);

        await captureAnalytics('document_created', { entry_point: 'home' });

        expect(getAnalyticsConsent()).toBe('unknown');
        expect(loader).not.toHaveBeenCalled();
        expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
    });

    it('initializes once after consent and records only an account UUID when identified', async () => {
        const client = createClient();
        const loader = vi.fn(async () => client);
        analyticsTesting.setLoader(loader);
        await identifyAnalyticsUser(accountId);

        await setAnalyticsConsent('granted');
        await captureAnalytics('document_created', { entry_point: 'home' });
        await captureAnalytics('document_created', { entry_point: 'menu' });

        expect(loader).toHaveBeenCalledTimes(1);
        expect(client.init).toHaveBeenCalledTimes(1);
        expect(client.identify).toHaveBeenCalledWith(accountId);
        expect(client.identify).not.toHaveBeenCalledWith(accountId, expect.anything());
        expect(client.capture).toHaveBeenCalledWith('app_opened');
        expect(client.capture).toHaveBeenCalledWith('analytics_consent_granted', {
            policy_version: ANALYTICS_POLICY_VERSION,
        });
        expect(client.init).toHaveBeenCalledWith(
            'phc_test',
            expect.objectContaining({
                api_host: 'https://eu.i.posthog.com',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: true,
                disable_external_dependency_loading: true,
                advanced_disable_flags: true,
                ip: false,
            })
        );
    });

    it('identifies with only the account UUID when authentication follows consent', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');

        await identifyAnalyticsUser(accountId);

        expect(client.identify).toHaveBeenCalledWith(accountId);
        expect(client.identify).not.toHaveBeenCalledWith(accountId, expect.anything());
    });

    it('rejects non-UUID identity values', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');

        await identifyAnalyticsUser('person@example.com');

        expect(client.identify).not.toHaveBeenCalled();
    });

    it('treats an obsolete policy decision as unknown', () => {
        localStorage.setItem(
            ANALYTICS_CONSENT_STORAGE_KEY,
            JSON.stringify({ status: 'granted', policyVersion: 'old-policy', decidedAt: new Date().toISOString() })
        );

        expect(getAnalyticsConsent()).toBe('unknown');
    });

    it('captures withdrawal before clearing identity and opting out', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');

        await setAnalyticsConsent('denied');

        expect(client.capture).toHaveBeenCalledWith(
            'analytics_consent_withdrawn',
            { policy_version: ANALYTICS_POLICY_VERSION },
            { transport: 'sendBeacon', send_instantly: true }
        );
        expect(client.reset).toHaveBeenCalledTimes(1);
        expect(client.opt_out_capturing).toHaveBeenCalledTimes(1);
        expect(getAnalyticsConsent()).toBe('denied');
    });

    it('opts an existing client back in when consent is granted again', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');
        await setAnalyticsConsent('denied');

        await setAnalyticsConsent('granted');

        expect(client.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
        expect(client.init).toHaveBeenCalledTimes(1);
    });

    it('emits document-open success only after import completion', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');
        client.capture.mockClear();

        stagePendingDocumentAnalytics({ source: 'browser_file_picker' });
        expect(client.capture).not.toHaveBeenCalled();

        await completePendingDocumentAnalytics();
        expect(client.capture).toHaveBeenCalledWith('document_opened', { source: 'browser_file_picker' });
        await failPendingDocumentAnalytics();
        expect(client.capture).toHaveBeenCalledTimes(1);
    });

    it('emits only a failure when a staged document import fails', async () => {
        const client = createClient();
        analyticsTesting.setLoader(async () => client);
        await setAnalyticsConsent('granted');
        client.capture.mockClear();

        stagePendingDocumentAnalytics({ source: 'drag_drop' });
        await failPendingDocumentAnalytics();
        await completePendingDocumentAnalytics();

        expect(client.capture).toHaveBeenCalledOnce();
        expect(client.capture).toHaveBeenCalledWith('document_operation_failed', {
            operation: 'open',
            failure_category: 'import',
        });
    });

    it('removes URL, identity, filename, and path data in the final sanitizer', () => {
        const event = sanitizePostHogEvent({
            event: 'document_saved',
            properties: {
                $current_url: 'mvmnt://app/private?token=secret',
                email: 'person@example.com',
                filename: 'private.mvt',
                safe_category: 'render',
                stack: '/Users/markus/project/file.ts person@example.com',
            },
        });

        expect(event?.properties).toEqual({
            safe_category: 'render',
            stack: '/Users/[redacted]/project/file.ts [redacted-email]',
        });
    });

    it('drops events outside the reviewed schema', () => {
        expect(sanitizePostHogEvent({ event: '$pageview', properties: {} })).toBeNull();
        expect(sanitizePostHogEvent({ event: '$autocapture', properties: {} })).toBeNull();
    });

    it('redacts exception messages while retaining sanitized stack coordinates', () => {
        const event = sanitizePostHogEvent({
            event: '$exception',
            properties: {
                $exception_level: 'fatal',
                secret_message: 'Project secret-project.mvt failed',
                app_version: '0.16.0',
                $exception_list: [
                    {
                        type: 'Error',
                        value: 'Could not open secret-project.mvt for person@example.com',
                        mechanism: { handled: false, type: 'onuncaughtexception', source: 'private-file.mvt' },
                        stacktrace: {
                            frames: [
                                {
                                    filename: 'file:///Users/markus/MVMNT/assets/index.js?token=secret',
                                    function: 'renderProject',
                                    lineno: 10,
                                    colno: 4,
                                },
                            ],
                        },
                    },
                ],
            },
        });

        expect(event?.properties).toEqual({
            $exception_level: 'fatal',
            app_version: '0.16.0',
            $exception_list: [
                {
                    type: 'Error',
                    value: '[redacted]',
                    mechanism: { handled: false, type: 'onuncaughtexception' },
                    stacktrace: {
                        frames: [
                            {
                                filename: 'file:///Users/[redacted]/MVMNT/assets/index.js',
                                function: 'renderProject',
                                lineno: 10,
                                colno: 4,
                            },
                        ],
                    },
                },
            ],
        });
    });
});
