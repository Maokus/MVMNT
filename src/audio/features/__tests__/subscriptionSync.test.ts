import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureControllerMocks = vi.hoisted(() => {
    const store = new Map<object, any>();

    const createController = () => ({
        setStaticRequirements: vi.fn(),
        updateTrack: vi.fn(),
        registerAdHocDescriptor: vi.fn(),
        syncExplicitDescriptors: vi.fn(),
        getActiveTrackId: vi.fn(() => null),
        getSubscriptionSnapshot: vi.fn(() => []),
        clear: vi.fn(),
    });

    return {
        store,
        createController,
    };
});

vi.mock('@audio/features/sceneApi', () => ({
    getElementSubscriptionSnapshot: vi.fn(() => []),
}));

vi.mock('@audio/features/featureSubscriptionController', () => {
    const { store, createController } = featureControllerMocks;
    return {
        getFeatureSubscriptionController: vi.fn((element: object) => {
            let controller = store.get(element);
            if (!controller) {
                controller = createController();
                store.set(element, controller);
            }
            return controller;
        }),
        peekFeatureSubscriptionController: vi.fn((element: object) => store.get(element) ?? null),
        releaseFeatureSubscriptionController: vi.fn((element: object) => {
            store.delete(element);
        }),
        resetFeatureSubscriptionControllersForTests: vi.fn(() => {
            store.clear();
        }),
        normalizeTrackId: (value: string | null | undefined) => {
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        },
    };
});

import { getElementSubscriptionSnapshot } from '@audio/features/sceneApi';
import {
    getElementSubscriptions,
    hasSubscription,
    isInRequirements,
    syncElementSubscriptions,
} from '@audio/features/subscriptionSync';
import { getFeatureSubscriptionController } from '@audio/features/featureSubscriptionController';

const element = { id: 'element-1', type: 'test' };

describe('subscriptionSync', () => {
    beforeEach(() => {
        vi.mocked(getElementSubscriptionSnapshot).mockClear();
        featureControllerMocks.store.clear();
        vi.mocked(getFeatureSubscriptionController).mockClear();
    });

    it('routes requirements through the feature subscription controller', () => {
        const requirements = [{ feature: 'spectrogram' }];
        syncElementSubscriptions(element, 'track-1', requirements);

        const controller = vi.mocked(getFeatureSubscriptionController).mock.results.at(-1)?.value as any;
        expect(controller).toBeDefined();
        expect(controller.setStaticRequirements).toHaveBeenCalledWith(requirements);
        expect(controller.updateTrack).toHaveBeenCalledWith('track-1');
    });

    it('normalizes repeated invocations to the same controller instance', () => {
        syncElementSubscriptions(element, 'track-a', [{ feature: 'rms' }]);
        syncElementSubscriptions(element, 'track-b', [{ feature: 'rms' }]);

        const controller = featureControllerMocks.store.get(element) as any;
        expect(controller.setStaticRequirements).toHaveBeenCalledTimes(2);
        expect(controller.updateTrack).toHaveBeenNthCalledWith(1, 'track-a');
        expect(controller.updateTrack).toHaveBeenNthCalledWith(2, 'track-b');
    });

    it('passes through track ids with surrounding whitespace for controller normalization', () => {
        syncElementSubscriptions(element, '  track-1  ', [{ feature: 'waveform' }]);

        const controller = featureControllerMocks.store.get(element) as any;
        expect(controller.updateTrack).toHaveBeenCalledWith('  track-1  ');
    });

    it('returns subscriptions from the scene api snapshot', () => {
        vi.mocked(getElementSubscriptionSnapshot).mockReturnValueOnce([
            { trackId: 'track-a', descriptor: { featureKey: 'rms' } as any },
        ]);

        const subscriptions = getElementSubscriptions(element);
        expect(subscriptions).toEqual([['track-a', { featureKey: 'rms' } as any]]);
    });

    it('checks whether a descriptor matches a subscription', () => {
        vi.mocked(getElementSubscriptionSnapshot).mockReturnValue([
            { trackId: 'track-a', descriptor: { featureKey: 'rms' } as any },
        ]);

        expect(hasSubscription(element, ' track-a ', { featureKey: 'rms' } as any)).toBe(true);
        expect(hasSubscription(element, 'track-b', { featureKey: 'rms' } as any)).toBe(false);
    });

    it('requires matching profile identity when checking subscriptions', () => {
        vi.mocked(getElementSubscriptionSnapshot).mockReturnValue([
            {
                trackId: 'track-a',
                descriptor: { featureKey: 'rms', analysisProfileId: 'adhoc-alpha' } as any,
            },
        ]);

        expect(
            hasSubscription(element, 'track-a', {
                featureKey: 'rms',
                analysisProfileId: 'adhoc-alpha',
            } as any)
        ).toBe(true);
        expect(
            hasSubscription(element, 'track-a', {
                featureKey: 'rms',
                analysisProfileId: 'adhoc-beta',
            } as any)
        ).toBe(false);
    });

    it('checks descriptor membership within requirement lists', () => {
        const descriptor = { featureKey: 'spectrogram', bandIndex: 2 } as any;
        const targets = [
            { featureKey: 'spectrogram', bandIndex: 1 } as any,
            { featureKey: 'spectrogram', bandIndex: 2 } as any,
        ];
        expect(isInRequirements(descriptor, targets)).toBe(true);
    });
});
