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
    const capturedSessionMilestones = new Set<string>();
    const getStorage = options.storage ?? defaultStorage;
    const getEventTarget = options.eventTarget ?? defaultEventTarget;
    let provider: AnalyticsProvider | null = null;
    let initialization: Promise<AnalyticsProvider | null> | null = null;
    let initializationGeneration = 0;
    let pendingAccountId: string | null = null;
    let appOpenedCaptured = false;
    let removeExceptionListeners: (() => void) | null = null;
    let consentOverride: AnalyticsConsentStatus | null = null;
    let consentGeneration = 0;

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
        return consentOverride ?? readConsent()?.status ?? 'unknown';
    }

    function writeConsent(status: Exclude<AnalyticsConsentStatus, 'unknown'>): {
        record: AnalyticsConsentRecord;
        saved: boolean;
    } {
        const record = { status, policyVersion: ANALYTICS_POLICY_VERSION, decidedAt: new Date().toISOString() };
        let saved = false;
        try {
            const storage = getStorage();
            if (storage) {
                storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(record));
                saved = true;
            }
        } catch {
            try {
                getStorage()?.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
            } catch {
                // Keep this choice fail-closed in memory when storage cannot be changed.
            }
        }
        consentOverride = saved ? null : status === 'denied' ? 'denied' : 'unknown';
        for (const listener of consentListeners) {
            try {
                listener();
            } catch {
                // A UI subscriber must not interrupt consent cleanup.
            }
        }
        return { record, saved };
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
        while (getConsent() === 'granted' && !provider) {
            if (!initialization) {
                const generation = consentGeneration;
                initializationGeneration = generation;
                const attempt = Promise.resolve()
                    .then(options.providerFactory)
                    .then(async (createdProvider) => {
                        try {
                            if (generation !== consentGeneration || getConsent() !== 'granted') return null;
                            await createdProvider.initialize(options.context());
                            if (generation !== consentGeneration || getConsent() !== 'granted') {
                                createdProvider.setEnabled(false);
                                createdProvider.shutdown({ clearPersistence: true });
                                return null;
                            }
                            provider = createdProvider;
                            provider.setEnabled(true);
                            if (pendingAccountId) provider.identify(pendingAccountId);
                            installExceptionListeners();
                            if (!appOpenedCaptured) {
                                provider.capture('app_opened', {});
                                appOpenedCaptured = true;
                            }
                            return provider;
                        } catch (error) {
                            if (provider === createdProvider) provider = null;
                            removeExceptionListeners?.();
                            try {
                                createdProvider.setEnabled(false);
                            } catch {
                                // The provider may itself be in a failed state.
                            }
                            try {
                                createdProvider.shutdown({ clearPersistence: true });
                            } catch {
                                // The provider may itself be in a failed state.
                            }
                            throw error;
                        }
                    })
                    .catch((error) => {
                        if (import.meta.env.DEV) console.warn('[analytics] initialization failed', error);
                        return null;
                    });
                initialization = attempt;
            }
            const attempt = initialization;
            const attemptGeneration = initializationGeneration;
            const result = await attempt;
            if (initialization === attempt) initialization = null;
            if (result && provider === result) return true;
            if (generationChangedOrUnavailable()) return false;
            if (attemptGeneration === consentGeneration) return false;
        }
        return Boolean(provider);
    }

    function generationChangedOrUnavailable(): boolean {
        return getConsent() !== 'granted' || !options.isEnabled();
    }

    async function send<K extends AnalyticsEventName>(
        event: K,
        properties: AnalyticsEventMap[K],
        immediate = false
    ): Promise<boolean> {
        const validated = validateAnalyticsEvent(event, properties);
        if (!validated) return false;
        const generation = consentGeneration;
        if (!(await initialize()) || generation !== consentGeneration || !provider) return false;
        try {
            provider.capture(event, toAnalyticsProperties(validated), immediate ? { immediate: true } : undefined);
            return true;
        } catch {
            return false;
        }
    }

    async function capture<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): Promise<void> {
        await send(event, properties);
    }

    async function captureMilestone<K extends AnalyticsEventName>(
        event: K,
        properties: AnalyticsEventMap[K]
    ): Promise<void> {
        const validated = validateAnalyticsEvent(event, properties);
        if (!validated) return;
        const key =
            event === 'media_imported' || event === 'scene_element_added'
                ? `${event}:${Object.values(validated)[0]}`
                : event;
        if (capturedSessionMilestones.has(key)) return;
        capturedSessionMilestones.add(key);
        const generation = consentGeneration;
        let sent = false;
        try {
            sent = await send(event, properties);
        } finally {
            if (!sent && generation === consentGeneration) capturedSessionMilestones.delete(key);
        }
    }

    async function identify(accountId: string): Promise<void> {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) return;
        pendingAccountId = accountId;
        if (provider && getConsent() === 'granted') provider.identify(accountId);
        else await initialize();
    }

    function reset(): void {
        pendingAccountId = null;
        try {
            provider?.reset();
        } catch {
            try {
                provider?.setEnabled(false);
            } catch {
                // Continue clearing a provider with a failed identity reset.
            }
            try {
                provider?.shutdown({ clearPersistence: true });
            } catch {
                // Continue clearing a provider with a failed identity reset.
            }
            provider = null;
            removeExceptionListeners?.();
            appOpenedCaptured = false;
            capturedSessionMilestones.clear();
        }
    }

    async function setConsent(status: 'granted' | 'denied'): Promise<void> {
        const previous = getConsent();
        if (status === 'granted' && previous === 'granted') {
            await initialize();
            return;
        }
        consentGeneration += 1;
        const generation = consentGeneration;
        const { record, saved } = writeConsent(status);
        if (status === 'granted') {
            if (saved && previous !== 'granted' && (await initialize()) && generation === consentGeneration)
                await send('analytics_consent_granted', { policy_version: record.policyVersion });
            return;
        }
        if (previous === 'granted' && provider) {
            try {
                provider.capture(
                    'analytics_consent_withdrawn',
                    { policy_version: record.policyVersion },
                    { immediate: true }
                );
            } catch {
                // Withdrawal must proceed even if the transport fails.
            }
        }
        pendingAccountId = null;
        removeExceptionListeners?.();
        const activeProvider = provider;
        provider = null;
        if (activeProvider) {
            try {
                activeProvider.reset();
            } catch {
                // Continue withdrawal if identity reset fails.
            }
            try {
                activeProvider.setEnabled(false);
            } catch {
                // Continue withdrawal if opt-out fails.
            }
            try {
                activeProvider.shutdown({ clearPersistence: true });
            } catch {
                // Continue withdrawal if provider cleanup fails.
            }
        }
        appOpenedCaptured = false;
        capturedSessionMilestones.clear();
    }

    async function getIdentifier(): Promise<string | null> {
        return (await initialize()) ? (provider?.getIdentifier() ?? null) : null;
    }

    function destroy(): void {
        consentGeneration += 1;
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
