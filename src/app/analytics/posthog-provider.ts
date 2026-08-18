import type {
    AnalyticsContext,
    AnalyticsDeliveryOptions,
    AnalyticsEventName,
    AnalyticsExceptionReport,
    AnalyticsProperties,
    AnalyticsProvider,
} from './contracts';
import { redactAnalyticsString, sanitizeAnalyticsObject, sanitizeAnalyticsValue } from './privacy';
import { isAnalyticsEventName } from './schema';

export interface PostHogEvent {
    event?: string;
    properties?: Record<string, unknown>;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
}

export interface PostHogClient {
    init(token: string, config: Record<string, unknown>): unknown;
    capture(event: string, properties?: Record<string, unknown>, options?: Record<string, unknown>): unknown;
    identify(distinctId: string): void;
    reset(): void;
    opt_in_capturing(options?: { captureEventName?: false }): void;
    opt_out_capturing(): void;
    get_distinct_id(): string;
    register(properties: Record<string, unknown>): void;
}

export type PostHogLoader = () => Promise<PostHogClient>;

export interface PostHogProviderOptions {
    token: string;
    host: string;
    loader?: PostHogLoader;
}

const commonPropertyNames = new Set([
    '$geoip_disable',
    'app_version',
    'app_release_line',
    'build_channel',
    'build_commit',
    'runtime',
    'platform',
    'consent_policy_version',
    '$release_id',
    'exception_fatal',
]);

export function sanitizePostHogEvent(event: PostHogEvent | null): PostHogEvent | null {
    if (!event) return event;
    if (!event.event || (event.event !== '$exception' && !isAnalyticsEventName(event.event))) return null;
    if (event.properties) {
        const exceptionList = event.event === '$exception' ? event.properties.$exception_list : undefined;
        const originalProperties = event.properties;
        event.properties =
            event.event === '$exception'
                ? Object.fromEntries(
                      Object.entries(originalProperties)
                          .filter(([key]) => commonPropertyNames.has(key))
                          .map(([key, value]) => [key, sanitizeAnalyticsValue(value)])
                  )
                : sanitizeAnalyticsObject(originalProperties);
        if (
            event.event === '$exception' &&
            typeof originalProperties.$exception_level === 'string' &&
            ['fatal', 'error'].includes(originalProperties.$exception_level)
        ) {
            event.properties.$exception_level = originalProperties.$exception_level;
        }
        if (Array.isArray(exceptionList)) {
            event.properties.$exception_list = exceptionList.map((item) => {
                const exception = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
                const stacktrace =
                    exception.stacktrace && typeof exception.stacktrace === 'object'
                        ? (exception.stacktrace as Record<string, unknown>)
                        : {};
                const frames = Array.isArray(stacktrace.frames)
                    ? stacktrace.frames.map((frame) => {
                          const source = frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : {};
                          return {
                              ...(typeof source.filename === 'string'
                                  ? { filename: redactAnalyticsString(source.filename).replace(/\?.*$/, '') }
                                  : {}),
                              ...(typeof source.function === 'string'
                                  ? { function: redactAnalyticsString(source.function) }
                                  : {}),
                              ...(typeof source.lineno === 'number' ? { lineno: source.lineno } : {}),
                              ...(typeof source.colno === 'number' ? { colno: source.colno } : {}),
                          };
                      })
                    : [];
                const mechanism =
                    exception.mechanism && typeof exception.mechanism === 'object'
                        ? (exception.mechanism as Record<string, unknown>)
                        : {};
                const mechanismType =
                    typeof mechanism.type === 'string' && ['onerror', 'onunhandledrejection'].includes(mechanism.type)
                        ? mechanism.type
                        : undefined;
                return {
                    ...(typeof exception.type === 'string' ? { type: redactAnalyticsString(exception.type) } : {}),
                    value: '[redacted]',
                    mechanism: { handled: false, ...(mechanismType ? { type: mechanismType } : {}) },
                    stacktrace: { frames },
                };
            });
        }
    }
    if (event.$set) event.$set = sanitizeAnalyticsObject(event.$set);
    if (event.$set_once) event.$set_once = sanitizeAnalyticsObject(event.$set_once);
    event.properties ??= {};
    event.properties.$geoip_disable = true;
    return event;
}

function removePostHogPersistence(token: string): void {
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key && (key.includes(token) || key.startsWith('ph_') || key.startsWith('posthog'))) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Storage cleanup is best-effort and must not interfere with withdrawal.
    }
}

export function createPostHogProvider(options: PostHogProviderOptions): AnalyticsProvider {
    const loader: PostHogLoader =
        options.loader ?? (async () => (await import('posthog-js')).default as unknown as PostHogClient);
    let client: PostHogClient | null = null;

    return {
        async initialize(context) {
            if (client) return;
            const loadedClient = await loader();
            loadedClient.init(options.token, {
                api_host: options.host,
                defaults: '2026-05-30',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                capture_dead_clicks: false,
                rageclick: false,
                capture_heatmaps: false,
                capture_performance: false,
                capture_exceptions: false,
                disable_session_recording: true,
                disable_surveys: true,
                disable_web_experiments: true,
                disable_product_tours: true,
                disable_conversations: true,
                disable_external_dependency_loading: true,
                opt_in_site_apps: false,
                advanced_disable_flags: true,
                save_campaign_params: false,
                save_referrer: false,
                ip: false,
                person_profiles: 'identified_only',
                persistence: 'localStorage',
                cross_subdomain_cookie: false,
                respect_dnt: true,
                before_send: sanitizePostHogEvent,
            });
            loadedClient.register({ ...context });
            client = loadedClient;
        },
        capture(event: AnalyticsEventName, properties: AnalyticsProperties, delivery?: AnalyticsDeliveryOptions) {
            client?.capture(
                event,
                properties,
                delivery?.immediate ? { transport: 'sendBeacon', send_instantly: true } : undefined
            );
        },
        captureException(report: AnalyticsExceptionReport) {
            client?.capture('$exception', {
                $exception_level: report.level,
                exception_fatal: report.fatal,
                $exception_list: [
                    {
                        type: report.type,
                        value: '[redacted]',
                        mechanism: { handled: false, type: report.mechanism },
                        stacktrace: { frames: report.frames },
                    },
                ],
            });
        },
        identify(accountId: string) {
            client?.identify(accountId);
        },
        reset() {
            client?.reset();
        },
        setEnabled(enabled: boolean) {
            if (enabled) client?.opt_in_capturing({ captureEventName: false });
            else client?.opt_out_capturing();
        },
        getIdentifier() {
            return client?.get_distinct_id() ?? null;
        },
        shutdown({ clearPersistence = false } = {}) {
            if (clearPersistence) removePostHogPersistence(options.token);
            client = null;
        },
    };
}
