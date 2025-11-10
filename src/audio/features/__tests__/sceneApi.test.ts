import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
    getFeatureData,
    clearFeatureData,
    resetSceneFeatureStateForTests,
    syncElementFeatureIntents,
    getElementSubscriptionSnapshot,
} from '@audio/features/sceneApi';
import * as analysisIntents from '@audio/features/analysisIntents';
import * as featureUtils from '@core/scene/elements/audioFeatureUtils';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';

const element = { id: 'element-1', type: 'testElement' };

const sampleFrame = {
    frameIndex: 0,
    fractionalIndex: 0,
    hopTicks: 1,
    format: 'float32' as const,
    values: [0.5],
};

let publishSpy: MockInstance<
    Parameters<typeof analysisIntents.publishAnalysisIntent>,
    ReturnType<typeof analysisIntents.publishAnalysisIntent>
>;
let clearSpy: MockInstance<
    Parameters<typeof analysisIntents.clearAnalysisIntent>,
    ReturnType<typeof analysisIntents.clearAnalysisIntent>
>;
let sampleSpy: MockInstance<
    Parameters<typeof featureUtils.sampleFeatureFrame>,
    ReturnType<typeof featureUtils.sampleFeatureFrame>
>;

describe('sceneApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        analysisIntents.resetAnalysisIntentStateForTests();
        resetSceneFeatureStateForTests();
        publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        clearSpy = vi.spyOn(analysisIntents, 'clearAnalysisIntent').mockImplementation(() => undefined);
        sampleSpy = vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue(sampleFrame as any);
    });

    afterEach(() => {
        analysisIntents.resetAnalysisIntentStateForTests();
        resetSceneFeatureStateForTests();
        vi.restoreAllMocks();
    });

    describe('getFeatureData', () => {
        it('publishes an analysis intent the first time data is requested and reuses it afterwards', () => {
            const first = getFeatureData(element, 'track-1', 'rms', 0);
            expect(first?.values).toEqual([0.5]);
            expect(publishSpy).toHaveBeenCalledTimes(1);

            const second = getFeatureData(element, 'track-1', 'rms', 1.5);
            expect(second?.values).toEqual([0.5]);
            expect(publishSpy).toHaveBeenCalledTimes(1);
        });

        it('republishes intents when the target track changes', () => {
            getFeatureData(element, 'track-1', 'rms', 0);
            expect(publishSpy).toHaveBeenCalledTimes(1);

            publishSpy.mockClear();
            getFeatureData(element, 'track-2', 'rms', 0);
            expect(publishSpy).toHaveBeenCalledTimes(1);
        });

        it('clears analysis intents when clearFeatureData is called', () => {
            getFeatureData(element, 'track-1', 'rms', 0);
            clearFeatureData(element);

            expect(clearSpy).toHaveBeenCalledWith('element-1');
        });

        it('accepts explicit sampling options parameter', () => {
            const spy = vi.spyOn(featureUtils, 'sampleFeatureFrame');
            getFeatureData(element, 'track-1', 'rms', 1.25, { smoothing: 2, interpolation: 'nearest' });

            expect(spy).toHaveBeenCalled();
            const [, descriptor, , sampling] = spy.mock.calls.at(-1)!;
            expect(descriptor).toMatchObject({ featureKey: 'rms' });
            expect(sampling).toMatchObject({ smoothing: 2 });
        });

        it('does not republish descriptors when only sampling options change', () => {
            const first = getFeatureData(element, 'track-1', 'rms', 0.25, { smoothing: 0 });
            expect(first?.values).toEqual([0.5]);
            expect(publishSpy).toHaveBeenCalledTimes(1);

            publishSpy.mockClear();
            const second = getFeatureData(element, 'track-1', 'rms', 0.5, { smoothing: 12 });
            expect(second?.values).toEqual([0.5]);
            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('shares descriptor identity across elements regardless of sampling options', () => {
            getFeatureData(element, 'track-1', 'rms', 0.1, { smoothing: 1 });
            expect(publishSpy).toHaveBeenCalledTimes(1);

            const sibling = { id: 'element-2', type: 'testElement' };
            const sample = getFeatureData(sibling, 'track-1', 'rms', 0.1, { smoothing: 24 });
            expect(sample?.values).toEqual([0.5]);
            expect(publishSpy).toHaveBeenCalledTimes(2);

            const firstDescriptors = publishSpy.mock.calls[0]?.[3] ?? [];
            const secondDescriptors = publishSpy.mock.calls[1]?.[3] ?? [];
            expect(firstDescriptors).toHaveLength(1);
            expect(secondDescriptors).toHaveLength(1);
            const firstId = analysisIntents.buildDescriptorId(firstDescriptors[0] as any);
            const secondId = analysisIntents.buildDescriptorId(secondDescriptors[0] as any);
            expect(secondId).toBe(firstId);
        });

        it('preserves existing descriptor profiles when sampling', () => {
            const descriptor = { featureKey: 'spectrogram', calculatorId: null, bandIndex: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor], 'oddProfile');
            publishSpy.mockClear();

            const spy = vi.spyOn(featureUtils, 'sampleFeatureFrame');
            const result = getFeatureData(element, 'track-1', 'spectrogram', 0.5);

            expect(result?.values).toEqual([0.5]);
            expect(spy).toHaveBeenCalled();
            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('avoids registering duplicate descriptors when requirements use non-default profiles', () => {
            const built = createFeatureDescriptor({ feature: 'spectrogram', profile: 'oddProfile' });
            syncElementFeatureIntents(element, 'track-1', [built.descriptor], built.profile ?? undefined);
            publishSpy.mockClear();

            const result = getFeatureData(element, 'track-1', 'spectrogram', 1.25);

            expect(result?.metadata.descriptor.analysisProfileId).toBe('oddProfile');
            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('reuses descriptors that specify profile overrides rather than creating defaults', () => {
            const built = createFeatureDescriptor({
                feature: 'spectrogram',
                profileParams: {
                    windowSize: 4096,
                    hopSize: 1024,
                    window: 'hann',
                },
            });
            syncElementFeatureIntents(
                element,
                'track-1',
                [built.descriptor],
                built.profile ?? undefined,
                built.profileRegistryDelta ?? undefined
            );
            publishSpy.mockClear();

            const result = getFeatureData(element, 'track-1', 'spectrogram', 2.5);

            expect(result?.metadata.descriptor.profileOverridesHash).toBe(built.descriptor.profileOverridesHash);
            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('samples regenerated data for ad-hoc profiles when available', () => {
            const built = createFeatureDescriptor({
                feature: 'spectrogram',
                profileParams: {
                    windowSize: 4096,
                    hopSize: 1024,
                    window: 'hann',
                },
            });
            expect(built.profile).toBeTruthy();
            expect(built.profile?.startsWith('adhoc-')).toBe(true);

            syncElementFeatureIntents(
                element,
                'track-1',
                [built.descriptor],
                built.profile ?? undefined,
                built.profileRegistryDelta ?? undefined
            );
            publishSpy.mockClear();

            const adHocSample = {
                ...sampleFrame,
                values: [0.25],
            } as any;
            const defaultSample = { ...sampleFrame, values: [0.5] } as any;

            sampleSpy.mockImplementation((trackId, descriptor, time) => {
                return descriptor.analysisProfileId === built.profile ? adHocSample : defaultSample;
            });

            const result = getFeatureData(element, 'track-1', 'spectrogram', 0.5);

            expect(result?.values).toEqual([0.25]);
            expect(sampleSpy).toHaveBeenCalled();
            const [, descriptorArg] = sampleSpy.mock.calls.at(-1)!;
            expect(descriptorArg.analysisProfileId).toBe(built.profile);
            expect(publishSpy).not.toHaveBeenCalled();
        });
    });

    describe('syncElementFeatureIntents', () => {
        it('publishes descriptors for an element', () => {
            const descriptor = { featureKey: 'rms', calculatorId: null, bandIndex: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);

            expect(publishSpy).toHaveBeenCalledTimes(1);
            const [, elementType, trackRef, descriptors] = publishSpy.mock.calls[0]!;
            expect(elementType).toBe('testElement');
            expect(trackRef).toBe('track-1');
            expect(descriptors).toHaveLength(1);
            expect(descriptors?.[0]).toMatchObject({ featureKey: 'rms' });
        });

        it('avoids republishing when descriptors are unchanged', () => {
            const descriptor = { featureKey: 'spectrogram', calculatorId: null, bandIndex: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);
            publishSpy.mockClear();

            syncElementFeatureIntents(element, 'track-1', [
                { featureKey: 'spectrogram', calculatorId: null, bandIndex: null } as any,
            ]);

            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('clears state when no descriptors remain', () => {
            const descriptor = { featureKey: 'waveform', calculatorId: null, bandIndex: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);
            clearSpy.mockClear();

            syncElementFeatureIntents(element, 'track-1', []);
            expect(clearSpy).toHaveBeenCalledWith('element-1');
        });
    });

    describe('getElementSubscriptionSnapshot', () => {
        it('returns descriptors currently tracked for an element', () => {
            const descriptor = { featureKey: 'rms', calculatorId: null, bandIndex: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);

            const snapshot = getElementSubscriptionSnapshot(element);
            expect(snapshot).toEqual([
                {
                    trackId: 'track-1',
                    descriptor: expect.objectContaining({ featureKey: 'rms' }),
                },
            ]);
        });
    });
});
