import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getFeatureSubscriptionController,
    releaseFeatureSubscriptionController,
    resetFeatureSubscriptionControllersForTests,
} from '@audio/features/featureSubscriptionController';
import * as analysisIntents from '@audio/features/analysisIntents';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';

const element = { id: 'controller-element', type: 'controllerTestElement' };

describe('FeatureSubscriptionController', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        analysisIntents.resetAnalysisIntentStateForTests();
        resetFeatureSubscriptionControllersForTests();
    });

    afterEach(() => {
        releaseFeatureSubscriptionController(element);
        analysisIntents.resetAnalysisIntentStateForTests();
        resetFeatureSubscriptionControllersForTests();
    });

    it('publishes static requirements when a track is set', () => {
        const publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        const controller = getFeatureSubscriptionController(element);

        controller.setStaticRequirements([{ feature: 'rms' }]);
        controller.updateTrack('track-1');

        expect(publishSpy).toHaveBeenCalledTimes(1);
        const [elementId, elementType, trackRef, descriptorsArg] = publishSpy.mock.calls[0]!;
        expect(elementId).toBe('controller-element');
        expect(elementType).toBe('controllerTestElement');
        expect(trackRef).toBe('track-1');
        const descriptors = descriptorsArg as unknown as any[];
        expect(Array.isArray(descriptors)).toBe(true);
        expect(descriptors).toHaveLength(1);
        expect(descriptors[0]).toMatchObject({ featureKey: 'rms' });
    });

    it('merges static and ad-hoc descriptors without duplicates', () => {
        const publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        const controller = getFeatureSubscriptionController(element);

        controller.setStaticRequirements([{ feature: 'rms' }]);
        controller.updateTrack('track-1');
        publishSpy.mockClear();

        const adhoc = createFeatureDescriptor({ feature: 'spectrogram', profileParams: { windowSize: 2048 } });
        controller.registerAdHocDescriptor(adhoc.descriptor, adhoc.profile);

        expect(publishSpy).toHaveBeenCalledTimes(1);
        const [, , , descriptorsArg, optionsArg] = publishSpy.mock.calls[0]!;
        const descriptors = descriptorsArg as unknown as any[];
        expect(descriptors).toHaveLength(2);
        const labels = descriptors.map((entry) => entry.featureKey);
        expect(labels).toEqual(expect.arrayContaining(['rms', 'spectrogram']));
        const options = optionsArg as any;
        if (options) {
            expect(options.profileRegistryDelta).toBeTruthy();
        }
    });

    it('replaces descriptors when explicit sync is provided', () => {
        const publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        const controller = getFeatureSubscriptionController(element);

        controller.setStaticRequirements([{ feature: 'rms' }]);
        controller.updateTrack('track-1');
        publishSpy.mockClear();

        const explicit = createFeatureDescriptor({ feature: 'spectrogram', calculatorId: 'fast' });
        controller.syncExplicitDescriptors(
            [explicit.descriptor],
            explicit.profile ?? undefined,
            explicit.profileRegistryDelta ?? undefined
        );

        expect(publishSpy).toHaveBeenCalledTimes(1);
        const [, , , descriptorsArg] = publishSpy.mock.calls[0]!;
        const descriptors = descriptorsArg as unknown as any[];
        expect(descriptors).toHaveLength(1);
        expect(descriptors[0]).toMatchObject({ featureKey: 'spectrogram', calculatorId: 'fast' });
    });

    it('clears analysis intents when the track is removed', () => {
        const publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        const clearSpy = vi.spyOn(analysisIntents, 'clearAnalysisIntent').mockImplementation(() => undefined);
        const controller = getFeatureSubscriptionController(element);

        controller.setStaticRequirements([{ feature: 'rms' }]);
        controller.updateTrack('track-1');
        expect(publishSpy).toHaveBeenCalledTimes(1);

        controller.updateTrack(null);
        expect(clearSpy).toHaveBeenCalledWith('controller-element');
    });
});
