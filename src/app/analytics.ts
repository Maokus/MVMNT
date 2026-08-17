import { BUILD_INFO } from './build-info';

export const ANALYTICS_POLICY_VERSION = '2026-08-17-v1';
export const ANALYTICS_CONSENT_STORAGE_KEY = 'mvmnt.analytics-consent.v1';

export type AnalyticsConsentStatus = 'unknown' | 'granted' | 'denied';

export interface AnalyticsConsentRecord {
    status: Exclude<AnalyticsConsentStatus, 'unknown'>;
    policyVersion: string;
    decidedAt: string;
}

type EmptyProperties = Record<string, never>;
type EntryPoint = 'home' | 'menu' | 'desktop_menu' | 'deep_link' | 'drag_drop' | 'community';
type DocumentSource =
    'file_picker' | 'browser_file_picker' | 'recent_documents' | 'drag_drop' | 'os_open' | 'community';
type MediaType = 'midi' | 'audio' | 'image' | 'font';
type ItemType = 'template' | 'plugin';
type ExportFormat = 'video' | 'png';
type ExportExecutionMode = 'foreground' | 'background' | 'automation';
type FailureCategory = 'cancelled' | 'validation' | 'import' | 'save' | 'render' | 'output' | 'unknown';

export interface PendingDocumentAnalytics {
    source?: DocumentSource;
    createdEntryPoint?: EntryPoint;
    templateEntryPoint?: 'home' | 'workspace' | 'community';
}

export interface AnalyticsEventMap {
    analytics_consent_granted: { policy_version: string };
    analytics_consent_withdrawn: { policy_version: string };
    app_opened: EmptyProperties;
    screen_viewed: { screen: 'home' | 'workspace' | 'about' | 'privacy' | 'changelog' | 'community' | 'contribute' };
    document_created: { entry_point: EntryPoint };
    document_opened: { source: DocumentSource };
    document_saved: { save_mode: 'save' | 'save_as' };
    document_operation_failed: { operation: 'open' | 'save'; failure_category: FailureCategory };
    media_imported: { media_type: MediaType };
    scene_element_added: { element_type: string };
    playback_started: EmptyProperties;
    template_applied: { entry_point: 'home' | 'workspace' | 'community' };
    export_started: {
        export_format: ExportFormat;
        includes_audio: boolean;
        transparent_background: boolean;
        execution_mode: ExportExecutionMode;
    };
    export_completed: { export_format: ExportFormat; execution_mode: ExportExecutionMode };
    export_failed: {
        export_format: ExportFormat;
        execution_mode: ExportExecutionMode;
        failure_category: FailureCategory;
    };
    export_cancelled: { export_format: ExportFormat; execution_mode: ExportExecutionMode };
    community_signup_submitted: EmptyProperties;
    community_sign_in_completed: EmptyProperties;
    community_sign_out: EmptyProperties;
    community_item_downloaded: { item_type: ItemType };
    community_template_opened: EmptyProperties;
    community_plugin_installed: EmptyProperties;
    community_item_rated: { rating: number };
    community_item_uploaded: { item_type: ItemType };
}

type AnalyticsEventName = keyof AnalyticsEventMap;
type AnalyticsProperties = Record<string, string | number | boolean>;

interface PostHogEvent {
    event?: string;
    properties?: Record<string, unknown>;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
}

interface PostHogClient {
    init(token: string, config: Record<string, unknown>): unknown;
    capture(event: string, properties?: Record<string, unknown>, options?: Record<string, unknown>): unknown;
    identify(distinctId: string): void;
    reset(): void;
    opt_in_capturing(options?: { captureEventName?: false }): void;
    opt_out_capturing(): void;
    get_distinct_id(): string;
    register(properties: Record<string, unknown>): void;
}

type PostHogLoader = () => Promise<PostHogClient>;

const consentListeners = new Set<() => void>();
const PENDING_DOCUMENT_ANALYTICS_KEY = 'mvmnt.analytics.pending-document.v1';
const capturedSessionMilestones = new Set<AnalyticsEventName>();
const allowedEventNames = new Set<string>([
    'analytics_consent_granted',
    'analytics_consent_withdrawn',
    'app_opened',
    'screen_viewed',
    'document_created',
    'document_opened',
    'document_saved',
    'document_operation_failed',
    'media_imported',
    'scene_element_added',
    'playback_started',
    'template_applied',
    'export_started',
    'export_completed',
    'export_failed',
    'export_cancelled',
    'community_signup_submitted',
    'community_sign_in_completed',
    'community_sign_out',
    'community_item_downloaded',
    'community_template_opened',
    'community_plugin_installed',
    'community_item_rated',
    'community_item_uploaded',
    '$exception',
]);
const deniedPropertyPattern =
    /(email|username|name|filename|file_name|path|url|href|referrer|query|content|password|token|secret)/i;
const urlPropertyNames = new Set([
    '$current_url',
    '$host',
    '$pathname',
    '$referrer',
    '$referring_domain',
    '$initial_current_url',
    '$initial_referrer',
    '$initial_referring_domain',
    '$gclid',
    '$dclid',
    '$gad_source',
    '$gclsrc',
    '$wbraid',
    '$gbraid',
    '$fbclid',
    '$msclkid',
    '$twclid',
    '$la_fat_id',
    '$mc_cid',
    '$igshid',
    '$ttclid',
]);
const commonPropertyNames = new Set([
    'app_version',
    'build_channel',
    'build_commit',
    'runtime',
    'platform',
    'consent_policy_version',
    '$release_id',
]);

let client: PostHogClient | null = null;
let initialization: Promise<PostHogClient | null> | null = null;
let pendingAccountId: string | null = null;
let appOpenedCaptured = false;
let postHogLoader: PostHogLoader = async () => (await import('posthog-js')).default as unknown as PostHogClient;

function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function readAnalyticsConsent(): AnalyticsConsentRecord | null {
    try {
        const raw = storage()?.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<AnalyticsConsentRecord>;
        if (
            (parsed.status !== 'granted' && parsed.status !== 'denied') ||
            parsed.policyVersion !== ANALYTICS_POLICY_VERSION ||
            typeof parsed.decidedAt !== 'string'
        ) {
            return null;
        }
        return parsed as AnalyticsConsentRecord;
    } catch {
        return null;
    }
}

export function getAnalyticsConsent(): AnalyticsConsentStatus {
    return readAnalyticsConsent()?.status ?? 'unknown';
}

export function subscribeToAnalyticsConsent(listener: () => void): () => void {
    consentListeners.add(listener);
    return () => consentListeners.delete(listener);
}

export function stagePendingDocumentAnalytics(context: PendingDocumentAnalytics): void {
    try {
        sessionStorage.setItem(PENDING_DOCUMENT_ANALYTICS_KEY, JSON.stringify(context));
    } catch {
        // Analytics context must never block document workflows.
    }
}

function takePendingDocumentAnalytics(): PendingDocumentAnalytics | null {
    try {
        const raw = sessionStorage.getItem(PENDING_DOCUMENT_ANALYTICS_KEY);
        sessionStorage.removeItem(PENDING_DOCUMENT_ANALYTICS_KEY);
        return raw ? (JSON.parse(raw) as PendingDocumentAnalytics) : null;
    } catch {
        return null;
    }
}

export async function completePendingDocumentAnalytics(): Promise<void> {
    const context = takePendingDocumentAnalytics();
    if (!context) return;
    if (context.source) await captureAnalytics('document_opened', { source: context.source });
    if (context.createdEntryPoint)
        await captureAnalytics('document_created', { entry_point: context.createdEntryPoint });
    if (context.templateEntryPoint)
        await captureAnalytics('template_applied', { entry_point: context.templateEntryPoint });
}

export async function failPendingDocumentAnalytics(): Promise<void> {
    const context = takePendingDocumentAnalytics();
    if (!context?.source) return;
    await captureAnalytics('document_operation_failed', { operation: 'open', failure_category: 'import' });
}

function notifyConsentListeners(): void {
    for (const listener of consentListeners) listener();
}

function writeConsent(status: Exclude<AnalyticsConsentStatus, 'unknown'>): AnalyticsConsentRecord {
    const record = { status, policyVersion: ANALYTICS_POLICY_VERSION, decidedAt: new Date().toISOString() };
    storage()?.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(record));
    notifyConsentListeners();
    return record;
}

function redactString(value: string): string {
    return value
        .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[redacted]')
        .replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
        .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1[redacted]');
}

function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (value && typeof value === 'object') return sanitizeObject(value as Record<string, unknown>);
    return value;
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(value)) {
        if (urlPropertyNames.has(key) || deniedPropertyPattern.test(key)) continue;
        sanitized[key] = sanitizeValue(property);
    }
    return sanitized;
}

export function sanitizePostHogEvent(event: PostHogEvent | null): PostHogEvent | null {
    if (!event) return event;
    if (!event.event || !allowedEventNames.has(event.event)) return null;
    if (event.properties) {
        const exceptionList = event.event === '$exception' ? event.properties.$exception_list : undefined;
        const originalProperties = event.properties;
        event.properties =
            event.event === '$exception'
                ? Object.fromEntries(
                      Object.entries(originalProperties)
                          .filter(([key]) => commonPropertyNames.has(key))
                          .map(([key, value]) => [key, sanitizeValue(value)])
                  )
                : sanitizeObject(originalProperties);
        if (
            event.event === '$exception' &&
            typeof originalProperties.$exception_level === 'string' &&
            ['fatal', 'error', 'warning', 'log', 'info', 'debug'].includes(originalProperties.$exception_level)
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
                                  ? { filename: redactString(source.filename).replace(/\?.*$/, '') }
                                  : {}),
                              ...(typeof source.function === 'string'
                                  ? { function: redactString(source.function) }
                                  : {}),
                              ...(typeof source.lineno === 'number' ? { lineno: source.lineno } : {}),
                              ...(typeof source.colno === 'number' ? { colno: source.colno } : {}),
                              ...(typeof source.in_app === 'boolean' ? { in_app: source.in_app } : {}),
                          };
                      })
                    : [];
                const mechanism =
                    exception.mechanism && typeof exception.mechanism === 'object'
                        ? (exception.mechanism as Record<string, unknown>)
                        : {};
                const mechanismType =
                    typeof mechanism.type === 'string' &&
                    ['generic', 'onunhandledrejection', 'onuncaughtexception', 'onconsole', 'middleware'].includes(
                        mechanism.type
                    )
                        ? mechanism.type
                        : undefined;
                return {
                    ...(typeof exception.type === 'string' ? { type: redactString(exception.type) } : {}),
                    value: '[redacted]',
                    mechanism: {
                        ...(typeof mechanism.handled === 'boolean' ? { handled: mechanism.handled } : {}),
                        ...(mechanismType ? { type: mechanismType } : {}),
                    },
                    stacktrace: { frames },
                };
            });
        }
    }
    if (event.$set) event.$set = sanitizeObject(event.$set);
    if (event.$set_once) event.$set_once = sanitizeObject(event.$set_once);
    return event;
}

function analyticsConfigured(): boolean {
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN || !import.meta.env.VITE_PUBLIC_POSTHOG_HOST) return false;
    return !import.meta.env.DEV || import.meta.env.VITE_PUBLIC_POSTHOG_ENABLE_DEVELOPMENT === 'true';
}

function coarsePlatform(): 'macos' | 'windows' | 'linux' | 'other' {
    const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux')) return 'linux';
    return 'other';
}

export async function initializeAnalytics(): Promise<boolean> {
    if (getAnalyticsConsent() !== 'granted' || !analyticsConfigured()) return false;
    if (client) return true;
    if (!initialization) {
        initialization = postHogLoader()
            .then((loadedClient) => {
                loadedClient.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
                    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST!,
                    defaults: '2026-05-30',
                    autocapture: false,
                    capture_pageview: false,
                    capture_pageleave: false,
                    capture_dead_clicks: false,
                    rageclick: false,
                    capture_heatmaps: false,
                    capture_performance: false,
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
                    capture_exceptions: {
                        capture_unhandled_errors: true,
                        capture_unhandled_rejections: true,
                        capture_console_errors: false,
                    },
                    before_send: sanitizePostHogEvent,
                });
                loadedClient.register({
                    app_version: BUILD_INFO.version,
                    build_channel: BUILD_INFO.channel,
                    build_commit: BUILD_INFO.commit,
                    runtime: window.mvmntDesktop ? 'desktop' : 'browser',
                    platform: coarsePlatform(),
                    consent_policy_version: ANALYTICS_POLICY_VERSION,
                });
                client = loadedClient;
                if (pendingAccountId) loadedClient.identify(pendingAccountId);
                if (!appOpenedCaptured) {
                    appOpenedCaptured = true;
                    loadedClient.capture('app_opened');
                }
                return loadedClient;
            })
            .catch((error) => {
                initialization = null;
                if (import.meta.env.DEV) console.warn('[analytics] initialization failed', error);
                return null;
            });
    }
    return Boolean(await initialization);
}

export async function captureAnalytics<K extends AnalyticsEventName>(
    event: K,
    properties: AnalyticsEventMap[K]
): Promise<void> {
    if (!(await initializeAnalytics()) || !client) return;
    client.capture(event, properties as AnalyticsProperties);
}

export async function captureAnalyticsMilestone<K extends AnalyticsEventName>(
    event: K,
    properties: AnalyticsEventMap[K]
): Promise<void> {
    if (capturedSessionMilestones.has(event)) return;
    capturedSessionMilestones.add(event);
    await captureAnalytics(event, properties);
}

export async function identifyAnalyticsUser(accountId: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) return;
    pendingAccountId = accountId;
    if (!(await initializeAnalytics()) || !client) return;
    client.identify(accountId);
}

export function resetAnalyticsIdentity(): void {
    pendingAccountId = null;
    client?.reset();
}

export async function setAnalyticsConsent(status: 'granted' | 'denied'): Promise<void> {
    const previous = getAnalyticsConsent();
    const record = writeConsent(status);
    if (status === 'granted') {
        if (client) client.opt_in_capturing({ captureEventName: false });
        if (await initializeAnalytics()) {
            await captureAnalytics('analytics_consent_granted', { policy_version: record.policyVersion });
        }
        return;
    }
    if (previous === 'granted' && client) {
        client.capture(
            'analytics_consent_withdrawn',
            { policy_version: record.policyVersion },
            { transport: 'sendBeacon', send_instantly: true }
        );
    }
    pendingAccountId = null;
    client?.reset();
    client?.opt_out_capturing();
    capturedSessionMilestones.clear();
}

export async function getAnalyticsIdentifier(): Promise<string | null> {
    if (!(await initializeAnalytics()) || !client) return null;
    return client.get_distinct_id();
}

export const analytics = {
    initialize: initializeAnalytics,
    capture: captureAnalytics,
    captureMilestone: captureAnalyticsMilestone,
    identify: identifyAnalyticsUser,
    reset: resetAnalyticsIdentity,
    setConsent: setAnalyticsConsent,
    getConsent: getAnalyticsConsent,
    getIdentifier: getAnalyticsIdentifier,
    subscribeToConsent: subscribeToAnalyticsConsent,
};

export const analyticsTesting = {
    setLoader(loader: PostHogLoader): void {
        postHogLoader = loader;
    },
    reset(): void {
        client = null;
        initialization = null;
        pendingAccountId = null;
        appOpenedCaptured = false;
        capturedSessionMilestones.clear();
        consentListeners.clear();
        postHogLoader = async () => (await import('posthog-js')).default as unknown as PostHogClient;
    },
};
