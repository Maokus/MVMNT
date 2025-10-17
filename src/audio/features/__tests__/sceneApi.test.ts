import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { getFeatureData, clearFeatureData, resetSceneFeatureStateForTests } from '@audio/features/sceneApi';
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

describe('sceneApi.getFeatureData', () => {
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
});
