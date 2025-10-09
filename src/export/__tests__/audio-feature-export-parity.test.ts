import { beforeEach, describe, expect, it } from 'vitest';
import { AudioFeatureBinding } from '@bindings/property-bindings';
import {
    sampleAudioFeatureRange,
    selectAudioFeatureFrame,
} from '@state/selectors/audioFeatureSelectors';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createFeatureCache(sourceId: string): AudioFeatureCache {
    const frameCount = 6;
    const hopTicks = 120;
    const channels = 3;
    const ticksPerSecond = getSharedTimingManager().secondsToTicks(1);
    const hopSeconds = hopTicks / ticksPerSecond;
    const data = new Float32Array(frameCount * channels);
    for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const offset = frame * channels + channel;
            const base = frameCount > 1 ? frame / (frameCount - 1) : 0;
            data[offset] = base + channel * 0.1;
        }
    }
    return {
        version: 1,
        audioSourceId: sourceId,
        hopTicks,
        hopSeconds,
        frameCount,
        analysisParams: {
            windowSize: 512,
            hopSize: 256,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: { 'mvmnt.rms': 1 },
        },
        featureTracks: {
            rms: {
                key: 'rms',
                calculatorId: 'mvmnt.rms',
                version: 1,
                frameCount,
                channels,
                hopTicks,
                hopSeconds,
                format: 'float32',
                data,
            },
        },
    };
}

function expectVectorsClose(actual: number[], expected: number[], digits = 6) {
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i += 1) {
        expect(actual[i]).toBeCloseTo(expected[i], digits);
    }
}

describe('audio feature export parity', () => {
    let cache: AudioFeatureCache;

    beforeEach(() => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        tm.setTempoMap(null);
        tm.setTicksPerQuarter(960);

        useTimelineStore.getState().resetTimeline();
        cache = createFeatureCache('audioTrack');

        useTimelineStore.setState((state) => ({
            ...state,
            timeline: { ...state.timeline, globalBpm: 120, masterTempoMap: undefined },
            tracks: {
                audioTrack: {
                    id: 'audioTrack',
                    name: 'Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['audioTrack'],
        }));

        useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', cache);
    });

    it('keeps runtime bindings, selectors, and export sampling in sync', () => {
        const runtimeBinding = new AudioFeatureBinding({
            trackId: 'audioTrack',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        const exportBinding = new AudioFeatureBinding(runtimeBinding.getConfig());

        const tm = getSharedTimingManager();
        const ticksPerSecond = tm.secondsToTicks(1);
        const secondsPerFrame = cache.featureTracks.rms.hopTicks / ticksPerSecond;
        const frameTimes = Array.from({ length: 4 }, (_, idx) => idx * secondsPerFrame);

        const runtimeVectors: number[][] = [];
        const exportVectors: number[][] = [];
        const selectorVectors: number[][] = [];

        for (const time of frameTimes) {
            const runtimeSample = runtimeBinding.getValueWithContext({ targetTime: time, sceneConfig: {} });
            expect(runtimeSample).toBeTruthy();
            runtimeVectors.push([...(runtimeSample?.values ?? [])]);

            const exportSample = exportBinding.getValueWithContext({ targetTime: time, sceneConfig: {} });
            expect(exportSample).toBeTruthy();
            exportVectors.push([...(exportSample?.values ?? [])]);

            const state = useTimelineStore.getState();
            const selectorSample = selectAudioFeatureFrame(
                state,
                'audioTrack',
                'rms',
                tm.secondsToTicks(time),
            );
            expect(selectorSample).toBeTruthy();
            selectorVectors.push([...(selectorSample?.values ?? [])]);
        }

        runtimeVectors.forEach((vector, index) => {
            expectVectorsClose(vector, exportVectors[index]);
            expectVectorsClose(vector, selectorVectors[index]);
        });

        const endTick =
            cache.featureTracks.rms.hopTicks * (frameTimes.length - 1) +
            (cache.featureTracks.rms.hopTicks - 1);
        const state = useTimelineStore.getState();
        const range = sampleAudioFeatureRange(state, 'audioTrack', 'rms', 0, endTick);
        expect(range).toBeDefined();
        expect(range?.frameCount).toBeGreaterThanOrEqual(frameTimes.length);
        expect(range?.frameTicks.length).toBe(range?.frameCount ?? 0);
        expect(range?.windowStartTick).toBeLessThanOrEqual(range?.windowEndTick ?? 0);

        for (let frame = 0; frame < frameTimes.length; frame += 1) {
            const frameVector: number[] = [];
            for (let channel = 0; channel < (range?.channels ?? 0); channel += 1) {
                frameVector.push(range?.data[frame * (range?.channels ?? 1) + channel] ?? 0);
            }
            expectVectorsClose(frameVector, selectorVectors[frame]);
        }

        const midTime = secondsPerFrame * 1.5;
        const runtimeSample = runtimeBinding.getValueWithContext({ targetTime: midTime, sceneConfig: {} });
        const exportSample = exportBinding.getValueWithContext({ targetTime: midTime, sceneConfig: {} });
        const selectorSample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tm.secondsToTicks(midTime));
        expect(runtimeSample).toBeTruthy();
        expect(exportSample).toBeTruthy();
        expect(selectorSample).toBeTruthy();
        expectVectorsClose(runtimeSample?.values ?? [], exportSample?.values ?? []);
        expectVectorsClose(runtimeSample?.values ?? [], selectorSample?.values ?? []);
    });
});
