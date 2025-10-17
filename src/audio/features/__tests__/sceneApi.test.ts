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

describe('sceneApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        analysisIntents.resetAnalysisIntentStateForTests();
        resetSceneFeatureStateForTests();
        publishSpy = vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        clearSpy = vi.spyOn(analysisIntents, 'clearAnalysisIntent').mockImplementation(() => undefined);
        vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue(sampleFrame as any);
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

        it('maps legacy smoothing option into sampling options', () => {
            const spy = vi.spyOn(featureUtils, 'sampleFeatureFrame');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            getFeatureData(element, 'track-1', 'rms', { smoothing: 5 } as any, 0.75);

            expect(spy).toHaveBeenCalled();
            const [, descriptor, time, sampling] = spy.mock.calls.at(-1)!;
            expect(descriptor).toMatchObject({ featureKey: 'rms' });
            expect((descriptor as any).smoothing).toBeUndefined();
            expect(time).toBeCloseTo(0.75);
            expect(sampling).toMatchObject({ smoothing: 5 });
            warnSpy.mockRestore();
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
    });

    describe('syncElementFeatureIntents', () => {
        it('publishes descriptors for an element', () => {
            const descriptor = { featureKey: 'rms', calculatorId: null, bandIndex: null, channel: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);

            expect(publishSpy).toHaveBeenCalledTimes(1);
            const [, elementType, trackRef, descriptors] = publishSpy.mock.calls[0]!;
            expect(elementType).toBe('testElement');
            expect(trackRef).toBe('track-1');
            expect(descriptors).toHaveLength(1);
            expect(descriptors?.[0]).toMatchObject({ featureKey: 'rms' });
        });

        it('avoids republishing when descriptors are unchanged', () => {
            const descriptor = { featureKey: 'spectrogram', calculatorId: null, bandIndex: null, channel: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);
            publishSpy.mockClear();

            syncElementFeatureIntents(element, 'track-1', [
                { featureKey: 'spectrogram', calculatorId: null, bandIndex: null, channel: null } as any,
            ]);

            expect(publishSpy).not.toHaveBeenCalled();
        });

        it('clears state when no descriptors remain', () => {
            const descriptor = { featureKey: 'waveform', calculatorId: null, bandIndex: null, channel: null } as any;
            syncElementFeatureIntents(element, 'track-1', [descriptor]);
            clearSpy.mockClear();

            syncElementFeatureIntents(element, 'track-1', []);
            expect(clearSpy).toHaveBeenCalledWith('element-1');
        });
    });

    describe('getElementSubscriptionSnapshot', () => {
        it('returns descriptors currently tracked for an element', () => {
            const descriptor = { featureKey: 'rms', calculatorId: null, bandIndex: null, channel: null } as any;
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
