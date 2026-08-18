import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_POLICY_VERSION, type AnalyticsContext } from '../analytics/contracts';
import { createPostHogProvider, sanitizePostHogEvent, type PostHogClient } from '../analytics/posthog-provider';

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
    } satisfies PostHogClient;
}

const context: AnalyticsContext = {
    app_version: '0.16.0',
    app_release_line: '0.16.0',
    build_channel: 'stable',
    build_commit: '61ed4413',
    runtime: 'desktop',
    platform: 'macos',
    consent_policy_version: ANALYTICS_POLICY_VERSION,
};

describe('PostHog analytics provider', () => {
    beforeEach(() => localStorage.clear());

    it('uses restrictive manual-capture configuration and registers release context', async () => {
        const client = createClient();
        const loader = vi.fn(async () => client);
        const provider = createPostHogProvider({ token: 'phc_test', host: 'https://eu.i.posthog.com', loader });

        await provider.initialize(context);
        provider.setEnabled(true);

        expect(loader).toHaveBeenCalledOnce();
        expect(client.init).toHaveBeenCalledWith(
            'phc_test',
            expect.objectContaining({
                api_host: 'https://eu.i.posthog.com',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                capture_exceptions: false,
                disable_session_recording: true,
                disable_external_dependency_loading: true,
                advanced_disable_flags: true,
                ip: false,
            })
        );
        expect(client.register).toHaveBeenCalledWith(context);
        expect(client.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    });

    it('translates provider-neutral exceptions without retaining a message', async () => {
        const client = createClient();
        const provider = createPostHogProvider({
            token: 'phc_test',
            host: 'https://eu.i.posthog.com',
            loader: async () => client,
        });
        await provider.initialize(context);

        provider.captureException({
            type: 'TypeError',
            level: 'fatal',
            fatal: true,
            mechanism: 'onunhandledrejection',
            frames: [{ filename: 'app.js', lineno: 1, colno: 2 }],
        });

        expect(client.capture).toHaveBeenCalledWith('$exception', {
            $exception_level: 'fatal',
            exception_fatal: true,
            $exception_list: [
                {
                    type: 'TypeError',
                    value: '[redacted]',
                    mechanism: { handled: false, type: 'onunhandledrejection' },
                    stacktrace: { frames: [{ filename: 'app.js', lineno: 1, colno: 2 }] },
                },
            ],
        });
    });

    it('clears PostHog persistence on shutdown without touching consent storage', async () => {
        const client = createClient();
        const provider = createPostHogProvider({
            token: 'phc_test',
            host: 'https://eu.i.posthog.com',
            loader: async () => client,
        });
        localStorage.setItem('ph_phc_test_posthog', 'identifier');
        localStorage.setItem('mvmnt.analytics-consent.v1', 'decision');
        await provider.initialize(context);

        provider.shutdown({ clearPersistence: true });

        expect(localStorage.getItem('ph_phc_test_posthog')).toBeNull();
        expect(localStorage.getItem('mvmnt.analytics-consent.v1')).toBe('decision');
    });

    it('removes denied data and forces GeoIP suppression in the final guard', () => {
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
            $geoip_disable: true,
            safe_category: 'render',
            stack: '/Users/[redacted]/project/file.ts [redacted-email]',
        });
        expect(sanitizePostHogEvent({ event: '$pageview', properties: {} })).toBeNull();
    });

    it('redacts exception messages while retaining sanitized stack coordinates', () => {
        const event = sanitizePostHogEvent({
            event: '$exception',
            properties: {
                $exception_level: 'fatal',
                exception_fatal: true,
                secret_message: 'Project secret-project.mvt failed',
                app_version: '0.16.0',
                $exception_list: [
                    {
                        type: 'Error',
                        value: 'Could not open secret-project.mvt for person@example.com',
                        mechanism: { handled: false, type: 'onunhandledrejection', source: 'private-file.mvt' },
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
            $geoip_disable: true,
            $exception_level: 'fatal',
            exception_fatal: true,
            app_version: '0.16.0',
            $exception_list: [
                {
                    type: 'Error',
                    value: '[redacted]',
                    mechanism: { handled: false, type: 'onunhandledrejection' },
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
