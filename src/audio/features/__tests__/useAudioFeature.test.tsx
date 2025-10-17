import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useAudioFeature, type UseAudioFeatureResult } from '@audio/features/useAudioFeature';
import * as sceneApi from '@audio/features/sceneApi';
import { resetSceneFeatureStateForTests } from '@audio/features/sceneApi';
import * as analysisIntents from '@audio/features/analysisIntents';
import * as featureUtils from '@core/scene/elements/audioFeatureUtils';

const sampleFrame = {
    frameIndex: 0,
    fractionalIndex: 0,
    hopTicks: 1,
    format: 'float32' as const,
    values: [0.25],
};

describe('useAudioFeature', () => {
    let clearSpy: MockInstance<
        Parameters<typeof sceneApi.clearFeatureData>,
        ReturnType<typeof sceneApi.clearFeatureData>
    >;

    beforeEach(() => {
        vi.restoreAllMocks();
        analysisIntents.resetAnalysisIntentStateForTests();
        resetSceneFeatureStateForTests();
        vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        vi.spyOn(analysisIntents, 'clearAnalysisIntent').mockImplementation(() => undefined);
        clearSpy = vi.spyOn(sceneApi, 'clearFeatureData');
        vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue(sampleFrame as any);
    });

    afterEach(() => {
        analysisIntents.resetAnalysisIntentStateForTests();
        resetSceneFeatureStateForTests();
        vi.restoreAllMocks();
    });

    it('provides audio samples and tracks loading state', () => {
        const { result, rerender, unmount } = renderHook<
            UseAudioFeatureResult,
            { track: string | null }
        >(({ track }) => useAudioFeature(track, 'rms'), {
            initialProps: { track: 'track-1' },
        });

        expect(result.current.isLoading).toBe(true);

        act(() => {
            const sample = result.current.getData(0);
            expect(sample?.values).toEqual([0.25]);
        });

        rerender({ track: 'track-1' });
        expect(result.current.isLoading).toBe(false);

        rerender({ track: null });
        act(() => {
            const sample = result.current.getData(1);
            expect(sample).toBeNull();
        });

        const callsBeforeUnmount = clearSpy.mock.calls.length;

        unmount();
        expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);
    });
});
