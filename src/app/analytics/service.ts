import {
    ANALYTICS_CONSENT_STORAGE_KEY,
    ANALYTICS_POLICY_VERSION,
    type AnalyticsConsentRecord,
    type AnalyticsConsentStatus,
    type AnalyticsContext,
    type AnalyticsEventMap,
    type AnalyticsEventName,
    type AnalyticsProvider,
    type AnalyticsProviderFactory,
    type AnalyticsService,
} from './contracts';
import { createAnalyticsExceptionReport } from './privacy';
import { toAnalyticsProperties, validateAnalyticsEvent } from './schema';

export interface CreateAnalyticsServiceOptions {
    providerFactory: AnalyticsProviderFactory;
    isEnabled: () => boolean;
    context: () => AnalyticsContext;
    storage?: () => Storage | null;
    eventTarget?: () => Window | null;
}

export interface AnalyticsServiceController extends AnalyticsService {
    destroy(): void;
}

function defaultStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

function defaultEventTarget(): Window | null {
    return typeof window === 'undefined' ? null : window;
}

export function createAnalyticsService(options: CreateAnalyticsServiceOptions): AnalyticsServiceController {
    const consentListeners = new Set<() => void>();
    const capturedSessionMilestones = new Set<AnalyticsEventName>();
    const getStorage = options.storage ?? defaultStorage;
    const getEventTarget = options.eventTarget ?? defaultEventTarget;
    let provider: AnalyticsProvider | null = null;
    let initialization: Promise<AnalyticsProvider | null> | null = null;
    let pendingAccountId: string | null = null;
    let appOpenedCaptured = false;
    let removeExceptionListeners: (() => void) | null = null;

    function readConsent(): AnalyticsConsentRecord | null {
        try {
            const raw = getStorage()?.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
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

    function getConsent(): AnalyticsConsentStatus {
        return readConsent()?.status ?? 'unknown';
    }

    function writeConsent(status: Exclude<AnalyticsConsentStatus, 'unknown'>): AnalyticsConsentRecord {
        const record = { status, policyVersion: ANALYTICS_POLICY_VERSION, decidedAt: new Date().toISOString() };
        getStorage()?.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(record));
        for (const listener of consentListeners) listener();
        return record;
    }

    function installExceptionListeners(): void {
        if (removeExceptionListeners) return;
        const target = getEventTarget();
        if (!target) return;
        const onError = (event: ErrorEvent) => {
            if (getConsent() !== 'granted') return;
            provider?.captureException(createAnalyticsExceptionReport(event.error, 'onerror'));
        };
        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (getConsent() !== 'granted') return;
            provider?.captureException(createAnalyticsExceptionReport(event.reason, 'onunhandledrejection'));
        };
        target.addEventListener('error', onError);
        target.addEventListener('unhandledrejection', onUnhandledRejection);
        removeExceptionListeners = () => {
            target.removeEventListener('error', onError);
            target.removeEventListener('unhandledrejection', onUnhandledRejection);
            removeExceptionListeners = null;
        };
    }

    async function initialize(): Promise<boolean> {
        if (getConsent() !== 'granted' || !options.isEnabled()) return false;
        if (provider) return true;
        if (!initialization) {
            initialization = options
                .providerFactory()
                .then(async (createdProvider) => {
                    await createdProvider.initialize(options.context());
                    if (getConsent() !== 'granted') {
                        createdProvider.setEnabled(false);
                        createdProvider.shutdown({ clearPersistence: true });
                        return null;
                    }
                    provider = createdProvider;
                    provider.setEnabled(true);
                    if (pendingAccountId) provider.identify(pendingAccountId);
                    installExceptionListeners();
                    if (!appOpenedCaptured) {
                        appOpenedCaptured = true;
                        provider.capture('app_opened', {});
                    }
                    return provider;
                })
                .catch((error) => {
                    initialization = null;
                    if (import.meta.env.DEV) console.warn('[analytics] initialization failed', error);
                    return null;
                });
        }
        return Boolean(await initialization);
    }

    async function send<K extends AnalyticsEventName>(
        event: K,
        properties: AnalyticsEventMap[K],
        immediate = false
    ): Promise<boolean> {
        const validated = validateAnalyticsEvent(event, properties);
        if (!validated || !(await initialize()) || !provider) return false;
        provider.capture(event, toAnalyticsProperties(validated), immediate ? { immediate: true } : undefined);
        return true;
    }

    async function capture<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): Promise<void> {
        await send(event, properties);
    }

    async function captureMilestone<K extends AnalyticsEventName>(
        event: K,
        properties: AnalyticsEventMap[K]
    ): Promise<void> {
        if (capturedSessionMilestones.has(event)) return;
        if (await send(event, properties)) capturedSessionMilestones.add(event);
    }

    async function identify(accountId: string): Promise<void> {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) return;
        pendingAccountId = accountId;
        if (await initialize()) provider?.identify(accountId);
    }

    function reset(): void {
        pendingAccountId = null;
        provider?.reset();
    }

    async function setConsent(status: 'granted' | 'denied'): Promise<void> {
        const previous = getConsent();
        const record = writeConsent(status);
        if (status === 'granted') {
            if (await initialize()) await send('analytics_consent_granted', { policy_version: record.policyVersion });
            return;
        }
        if (previous === 'granted' && provider) {
            provider.capture(
                'analytics_consent_withdrawn',
                { policy_version: record.policyVersion },
                { immediate: true }
            );
        }
        pendingAccountId = null;
        removeExceptionListeners?.();
        if (provider) {
            provider.reset();
            provider.setEnabled(false);
            provider.shutdown({ clearPersistence: true });
        }
        provider = null;
        initialization = null;
        appOpenedCaptured = false;
        capturedSessionMilestones.clear();
    }

    async function getIdentifier(): Promise<string | null> {
        return (await initialize()) ? (provider?.getIdentifier() ?? null) : null;
    }

    function destroy(): void {
        removeExceptionListeners?.();
        provider?.shutdown();
        provider = null;
        initialization = null;
        pendingAccountId = null;
        appOpenedCaptured = false;
        capturedSessionMilestones.clear();
        consentListeners.clear();
    }

    return {
        initialize,
        capture,
        captureMilestone,
        identify,
        reset,
        setConsent,
        getConsent,
        getIdentifier,
        subscribeToConsent(listener) {
            consentListeners.add(listener);
            return () => consentListeners.delete(listener);
        },
        destroy,
    };
}
