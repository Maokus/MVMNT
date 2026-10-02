import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ANALYTICS_CONSENT_STORAGE_KEY,
    ANALYTICS_POLICY_VERSION,
    type AnalyticsContext,
    type AnalyticsProvider,
} from '../analytics/contracts';
import { createAnalyticsService } from '../analytics/service';
import { analyticsEnabledForBuild } from '../analytics';

const context: AnalyticsContext = {
    app_version: '0.16.0-nightly.20260817.42',
    app_release_line: '0.16.0',
    build_channel: 'nightly',
    build_commit: '61ed4413',
    runtime: 'desktop',
    platform: 'macos',
    consent_policy_version: ANALYTICS_POLICY_VERSION,
};

function createProvider() {
    return {
        initialize: vi.fn(async () => undefined),
        capture: vi.fn(),
        captureException: vi.fn(),
        identify: vi.fn(),
        reset: vi.fn(),
        setEnabled: vi.fn(),
        getIdentifier: vi.fn(() => 'anonymous-id'),
        shutdown: vi.fn(),
    } satisfies AnalyticsProvider;
}

function createHarness(enabled = true, eventTarget: Window | null = window) {
    const provider = createProvider();
    const providerFactory = vi.fn(async () => provider);
    const service = createAnalyticsService({
        providerFactory,
        isEnabled: () => enabled,
        context: () => context,
        eventTarget: () => eventTarget,
    });
    return { provider, providerFactory, service };
}

describe('provider-neutral analytics service', () => {
    const accountId = '123e4567-e89b-42d3-a456-426614174000';

    beforeEach(() => {
        localStorage.clear();
    });

    it('enables stable and nightly builds but requires an explicit development override', () => {
        expect(analyticsEnabledForBuild('stable', 'token', 'host', undefined)).toBe(true);
        expect(analyticsEnabledForBuild('nightly', 'token', 'host', undefined)).toBe(true);
        expect(analyticsEnabledForBuild('development', 'token', 'host', undefined)).toBe(false);
        expect(analyticsEnabledForBuild('development', 'token', 'host', 'true')).toBe(true);
        expect(analyticsEnabledForBuild('stable', undefined, 'host', undefined)).toBe(false);
    });

    it('does not create a provider or persistence before explicit consent', async () => {
        const { providerFactory, service } = createHarness();

        await service.capture('document_created', { entry_point: 'home' });

        expect(service.getConsent()).toBe('unknown');
        expect(providerFactory).not.toHaveBeenCalled();
        expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
        service.destroy();
    });

    it('initializes once and supplies release-aware common context', async () => {
        const { provider, providerFactory, service } = createHarness();

        await service.setConsent('granted');
        await service.capture('document_created', { entry_point: 'home' });
        await service.capture('document_created', { entry_point: 'menu' });

        expect(providerFactory).toHaveBeenCalledOnce();
        expect(provider.initialize).toHaveBeenCalledOnce();
        expect(provider.initialize).toHaveBeenCalledWith(context);
        expect(provider.capture).toHaveBeenCalledWith('app_opened', {});
        expect(provider.capture).toHaveBeenCalledWith(
            'analytics_consent_granted',
            { policy_version: ANALYTICS_POLICY_VERSION },
            undefined
        );
        service.destroy();
    });

    it('treats rapid repeated grants as one consent decision', async () => {
        const { provider, providerFactory, service } = createHarness();
        await Promise.all([service.setConsent('granted'), service.setConsent('granted')]);

        expect(providerFactory).toHaveBeenCalledOnce();
        expect(provider.capture.mock.calls.filter(([event]) => event === 'analytics_consent_granted')).toHaveLength(1);
        service.destroy();
    });

    it('identifies with only an account UUID before or after consent', async () => {
        const { provider, service } = createHarness();

        await service.identify(accountId);
        await service.setConsent('granted');
        await service.identify(accountId);
        await service.identify('person@example.com');

        expect(provider.identify).toHaveBeenCalledWith(accountId);
        expect(provider.identify).not.toHaveBeenCalledWith(accountId, expect.anything());
        expect(provider.identify).not.toHaveBeenCalledWith('person@example.com');
        service.destroy();
    });

    it('invalidates obsolete consent records', () => {
        const { service } = createHarness();
        localStorage.setItem(
            ANALYTICS_CONSENT_STORAGE_KEY,
            JSON.stringify({ status: 'granted', policyVersion: 'old-policy', decidedAt: new Date().toISOString() })
        );

        expect(service.getConsent()).toBe('unknown');
        service.destroy();
    });

    it('captures withdrawal before identity reset, opt-out, and persistence cleanup', async () => {
        const { provider, service } = createHarness();
        await service.setConsent('granted');
        provider.capture.mockClear();

        await service.setConsent('denied');

        expect(provider.capture).toHaveBeenCalledWith(
            'analytics_consent_withdrawn',
            { policy_version: ANALYTICS_POLICY_VERSION },
            { immediate: true }
        );
        expect(provider.reset).toHaveBeenCalledOnce();
        expect(provider.setEnabled).toHaveBeenLastCalledWith(false);
        expect(provider.shutdown).toHaveBeenCalledWith({ clearPersistence: true });
        expect(provider.capture.mock.invocationCallOrder[0]).toBeLessThan(provider.reset.mock.invocationCallOrder[0]);
        expect(service.getConsent()).toBe('denied');
        service.destroy();
    });

    it('does not create a provider when development analytics is disabled', async () => {
        const { providerFactory, service } = createHarness(false);

        await service.setConsent('granted');

        expect(providerFactory).not.toHaveBeenCalled();
        service.destroy();
    });

    it('rejects runtime-invalid properties and deduplicates only captured milestones', async () => {
        const { provider, service } = createHarness();
        await service.captureMilestone('playback_started', {});
        await service.setConsent('granted');
        provider.capture.mockClear();

        await service.captureMilestone('playback_started', {});
        await service.captureMilestone('playback_started', {});
        await service.capture('community_item_rated', { rating: 0 });
        await service.capture('document_saved', { save_mode: 'save', filename: 'private.mvt' } as never);

        expect(provider.capture).toHaveBeenCalledOnce();
        expect(provider.capture).toHaveBeenCalledWith('playback_started', {}, undefined);
        service.destroy();
    });

    it('reserves concurrent milestones and keeps one of each category', async () => {
        const { provider, service } = createHarness();
        await service.setConsent('granted');
        provider.capture.mockClear();

        await Promise.all([
            service.captureMilestone('media_imported', { media_type: 'midi' }),
            service.captureMilestone('media_imported', { media_type: 'midi' }),
            service.captureMilestone('media_imported', { media_type: 'audio' }),
            service.captureMilestone('scene_element_added', { element_type: 'piano-roll' }),
            service.captureMilestone('scene_element_added', { element_type: 'spectrum' }),
        ]);

        expect(provider.capture.mock.calls.map(([event, properties]) => [event, properties])).toEqual([
            ['media_imported', { media_type: 'midi' }],
            ['media_imported', { media_type: 'audio' }],
            ['scene_element_added', { element_type: 'piano-roll' }],
            ['scene_element_added', { element_type: 'spectrum' }],
        ]);
        service.destroy();
    });

    it('does not identify an account after sign-out while initialization is pending', async () => {
        const provider = createProvider();
        let finishInitialization: (() => void) | undefined;
        provider.initialize.mockImplementation(
            () => new Promise<undefined>((resolve) => (finishInitialization = () => resolve(undefined)))
        );
        const service = createAnalyticsService({
            providerFactory: async () => provider,
            isEnabled: () => true,
            context: () => context,
        });
        localStorage.setItem(
            ANALYTICS_CONSENT_STORAGE_KEY,
            JSON.stringify({
                status: 'granted',
                policyVersion: ANALYTICS_POLICY_VERSION,
                decidedAt: new Date().toISOString(),
            })
        );

        const identifying = service.identify(accountId);
        await vi.waitFor(() => expect(finishInitialization).toBeTypeOf('function'));
        service.reset();
        finishInitialization?.();
        await identifying;

        expect(provider.identify).not.toHaveBeenCalled();
        service.destroy();
    });

    it('discards a withdrawn initialization before starting a later consent generation', async () => {
        const first = createProvider();
        const second = createProvider();
        let finishFirst: (() => void) | undefined;
        first.initialize.mockImplementation(
            () => new Promise<undefined>((resolve) => (finishFirst = () => resolve(undefined)))
        );
        const factory = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
        const service = createAnalyticsService({
            providerFactory: factory,
            isEnabled: () => true,
            context: () => context,
        });

        const firstGrant = service.setConsent('granted');
        await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'));
        await service.setConsent('denied');
        const secondGrant = service.setConsent('granted');
        finishFirst?.();
        await Promise.all([firstGrant, secondGrant]);

        expect(first.capture).not.toHaveBeenCalled();
        expect(first.shutdown).toHaveBeenCalledWith({ clearPersistence: true });
        expect(second.capture).toHaveBeenCalledWith('app_opened', {});
        expect(factory).toHaveBeenCalledTimes(2);
        service.destroy();
    });

    it('stops capture when a denial cannot be written to storage', async () => {
        const { provider } = createHarness();
        let denyWrite = false;
        const storage = {
            getItem: (key: string) => localStorage.getItem(key),
            setItem: (key: string, value: string) => {
                if (denyWrite) throw new Error('storage unavailable');
                localStorage.setItem(key, value);
            },
            removeItem: (key: string) => localStorage.removeItem(key),
        } as Storage;
        const service = createAnalyticsService({
            providerFactory: async () => provider,
            isEnabled: () => true,
            context: () => context,
            storage: () => storage,
        });
        await service.setConsent('granted');
        denyWrite = true;
        await service.setConsent('denied');
        provider.capture.mockClear();
        await service.capture('document_created', { entry_point: 'home' });

        expect(service.getConsent()).toBe('denied');
        expect(provider.capture).not.toHaveBeenCalled();
        expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
        service.destroy();
    });

    it('does not initialize when a grant cannot be persisted', async () => {
        const providerFactory = vi.fn(async () => createProvider());
        const service = createAnalyticsService({
            providerFactory,
            isEnabled: () => true,
            context: () => context,
            storage: () =>
                ({
                    setItem: () => {
                        throw new Error('storage unavailable');
                    },
                }) as unknown as Storage,
        });

        await service.setConsent('granted');
        expect(service.getConsent()).toBe('unknown');
        expect(providerFactory).not.toHaveBeenCalled();
        service.destroy();
    });

    it('releases a milestone reservation after a provider capture failure', async () => {
        const { provider, service } = createHarness();
        await service.setConsent('granted');
        provider.capture.mockClear().mockImplementationOnce(() => {
            throw new Error('transport failed');
        });

        await service.captureMilestone('playback_started', {});
        await service.captureMilestone('playback_started', {});

        expect(provider.capture).toHaveBeenCalledTimes(2);
        service.destroy();
    });

    it('captures sanitized renderer exceptions only while consent is active', async () => {
        const eventTarget = new EventTarget() as unknown as Window;
        const { provider, service } = createHarness(true, eventTarget);
        eventTarget.dispatchEvent(new ErrorEvent('error', { error: new Error('before consent') }));
        await service.setConsent('granted');

        eventTarget.dispatchEvent(
            new ErrorEvent('error', {
                error: Object.assign(new Error('private-project.mvt'), {
                    stack: 'Error: private-project.mvt\n    at render (/Users/markus/project.ts:10:4)',
                }),
            })
        );

        expect(provider.captureException).toHaveBeenCalledWith({
            type: 'Error',
            level: 'error',
            fatal: false,
            mechanism: 'onerror',
            frames: [{ function: 'render', filename: '/Users/[redacted]/project.ts', lineno: 10, colno: 4 }],
        });
        await service.setConsent('denied');
        provider.captureException.mockClear();
        eventTarget.dispatchEvent(new ErrorEvent('error', { error: new Error('after withdrawal') }));
        expect(provider.captureException).not.toHaveBeenCalled();
        service.destroy();
    });
});
