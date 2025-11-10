import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@audio/features/sceneApi', () => ({
    clearFeatureData: vi.fn(),
    syncElementFeatureIntents: vi.fn(),
    getElementSubscriptionSnapshot: vi.fn(() => []),
}));

import { clearFeatureData, syncElementFeatureIntents, getElementSubscriptionSnapshot } from '@audio/features/sceneApi';
import {
    getElementSubscriptions,
    hasSubscription,
    isInRequirements,
    syncElementSubscriptions,
} from '@audio/features/subscriptionSync';

const element = { id: 'element-1', type: 'test' };

describe('subscriptionSync', () => {
    beforeEach(() => {
        vi.mocked(clearFeatureData).mockClear();
        vi.mocked(syncElementFeatureIntents).mockClear();
        vi.mocked(getElementSubscriptionSnapshot).mockClear();
    });

    it('clears feature data when track id is missing', () => {
        syncElementSubscriptions(element, null, [{ feature: 'rms' }]);
        expect(clearFeatureData).toHaveBeenCalledWith(element, null);
        expect(syncElementFeatureIntents).not.toHaveBeenCalled();
    });

    it('clears feature data when requirements are empty', () => {
        syncElementSubscriptions(element, 'track-1', []);
        expect(clearFeatureData).toHaveBeenCalledWith(element, 'track-1');
        expect(syncElementFeatureIntents).not.toHaveBeenCalled();
    });

    it('syncs unique descriptors for the provided requirements', () => {
        syncElementSubscriptions(element, ' track-1 ', [
            { feature: 'rms' },
            { feature: 'rms' },
            { feature: 'spectrogram', bandIndex: 1 },
        ]);

        expect(clearFeatureData).not.toHaveBeenCalled();
        expect(syncElementFeatureIntents).toHaveBeenCalledTimes(1);
        const [, normalizedTrack, descriptors] = vi.mocked(syncElementFeatureIntents).mock.calls[0]!;
        expect(normalizedTrack).toBe('track-1');
        expect(descriptors).toHaveLength(2);
    });

    it('treats profile overrides as part of descriptor identity', () => {
        syncElementSubscriptions(element, 'track-1', [
            { feature: 'rms', profileParams: { windowSize: 1024 } },
            { feature: 'rms', profileParams: { windowSize: 2048 } },
        ]);

        expect(syncElementFeatureIntents).toHaveBeenCalledTimes(1);
        const [, , descriptors, profile, registryDelta] = vi.mocked(syncElementFeatureIntents).mock.calls[0]!;
        expect(descriptors).toHaveLength(2);
        const profileIds = new Set(descriptors.map((entry: any) => entry.analysisProfileId));
        expect(profileIds.size).toBe(2);
        expect(typeof profile).toBe('string');
        expect(profileIds.has(profile as string)).toBe(true);
        expect(registryDelta).toBeTruthy();
        expect(Object.keys(registryDelta as Record<string, unknown>)).toEqual(Array.from(profileIds));
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
