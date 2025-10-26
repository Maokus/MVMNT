import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFeatureFrame } from '@core/scene/elements/audioFeatureUtils';
import { selectAudioFeatureFrame } from '@state/selectors/audioFeatureSelectors';
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
    const tempoProjection = { hopTicks, startTick: 0 } as const;
    const channelAliases = ['Left', 'Right', 'Center'];
    const analysisProfiles = {
        default: {
            id: 'default',
            windowSize: 512,
            hopSize: 256,
            overlap: 2,
            sampleRate: 48000,
        },
    } as const;
    return {
        version: 3,
        audioSourceId: sourceId,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection,
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
                startTimeSeconds: 0,
                tempoProjection,
                format: 'float32',
                data,
                channelAliases,
                channelLayout: { aliases: channelAliases, semantics: 'multi-channel' },
                analysisProfileId: 'default',
            },
        },
        analysisProfiles,
        defaultAnalysisProfileId: 'default',
        channelAliases,
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

    it('keeps runtime sampling and selector sampling in sync', () => {
        const descriptor = {
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
            smoothing: null,
            bandIndex: null,
        } as const;
        const tm = getSharedTimingManager();
        const ticksPerSecond = tm.secondsToTicks(1);
        const rmsTrack = cache.featureTracks.rms;
        const hopTicks = rmsTrack.hopTicks ?? 0;
        const secondsPerFrame = hopTicks / ticksPerSecond;
        const frameTimes = Array.from({ length: 4 }, (_, idx) => idx * secondsPerFrame);

        const runtimeVectors: number[][] = [];
        const selectorVectors: number[][] = [];

        for (const time of frameTimes) {
            const runtimeSample = sampleFeatureFrame('audioTrack', descriptor, time);
            expect(runtimeSample).toBeTruthy();
            runtimeVectors.push([...(runtimeSample?.values ?? [])]);

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
            expectVectorsClose(vector, selectorVectors[index]);
        });

        const midTime = secondsPerFrame * 1.5;
        const runtimeSample = sampleFeatureFrame('audioTrack', descriptor, midTime);
        const selectorSample = selectAudioFeatureFrame(
            useTimelineStore.getState(),
            'audioTrack',
            'rms',
            tm.secondsToTicks(midTime),
        );
        expect(runtimeSample).toBeTruthy();
        expect(selectorSample).toBeTruthy();
        expectVectorsClose(runtimeSample?.values ?? [], selectorSample?.values ?? []);
    });
});
