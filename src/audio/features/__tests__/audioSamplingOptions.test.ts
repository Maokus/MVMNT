import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { sampleFeatureFrame } from '@core/scene/elements/audioFeatureUtils';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';

const { getTempoAlignedFrameMock, getTempoAlignedRangeMock } = vi.hoisted(() => ({
    getTempoAlignedFrameMock: vi.fn(),
    getTempoAlignedRangeMock: vi.fn(),
}));

vi.mock('@audio/features/tempoAlignedViewAdapter', () => ({
    getTempoAlignedFrame: getTempoAlignedFrameMock,
    getTempoAlignedRange: getTempoAlignedRangeMock,
}));

function createFeatureCache(sourceId: string): AudioFeatureCache {
    const frameCount = 4;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    return {
        version: 3,
        audioSourceId: sourceId,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 256,
            hopSize: 128,
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
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data: new Float32Array(frameCount),
                analysisProfileId: 'default',
                channelAliases: null,
            },
        },
        analysisProfiles: {
            default: {
                id: 'default',
                windowSize: 256,
                hopSize: 128,
                overlap: 2,
                sampleRate: 48000,
            },
        },
        defaultAnalysisProfileId: 'default',
        channelAliases: null,
    };
}

describe('audio sampling options cache behaviour', () => {
    const descriptor = {
        featureKey: 'rms',
        calculatorId: 'mvmnt.rms',
        bandIndex: null,
        channel: null,
    } as const;

    beforeEach(() => {
        let invocation = 0;
        getTempoAlignedFrameMock.mockReset();
        getTempoAlignedRangeMock.mockReset();
        getTempoAlignedFrameMock.mockImplementation(() => {
            invocation += 1;
            return {
                sample: {
                    frameIndex: 0,
                    fractionalIndex: 0,
                    hopTicks: 120,
                    values: [0.2 + invocation * 0.1],
                    format: 'float32' as const,
                },
                diagnostics: {
                    trackId: 'audioTrack',
                    sourceId: 'audioTrack',
                    featureKey: 'rms',
                    cacheHit: true,
                    interpolation: 'linear',
                    mapperDurationNs: 0,
                    frameCount: 1,
                    requestStartTick: 0,
                    timestamp: Date.now(),
                },
            };
        });

        const tm = getSharedTimingManager();
        tm.setBPM(120);
        tm.setTempoMap(null);
        tm.setTicksPerQuarter(960);

        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            timeline: { ...state.timeline, globalBpm: 120, masterTempoMap: undefined },
            tracks: {
                ...state.tracks,
                audioTrack: {
                    id: 'audioTrack',
                    name: 'Audio Track',
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

        const cache = createFeatureCache('audioTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', cache);
    });

    afterEach(() => {
        useTimelineStore.getState().resetTimeline();
    });

    it('reuses cached samples when smoothing radius is unchanged', () => {
        const first = sampleFeatureFrame('audioTrack', descriptor, 0.05, { smoothing: 0 });
        const second = sampleFeatureFrame('audioTrack', descriptor, 0.05, { smoothing: 0 });

        expect(getTempoAlignedFrameMock).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
        expect(first?.values[0]).toBeCloseTo(0.3, 5);
    });

    it('treats different smoothing radii as distinct cache entries', () => {
        const base = sampleFeatureFrame('audioTrack', descriptor, 0.05, { smoothing: 0 });
        expect(base?.values[0]).toBeCloseTo(0.3, 5);
        expect(getTempoAlignedFrameMock).toHaveBeenCalledTimes(1);

        const smoothed = sampleFeatureFrame('audioTrack', descriptor, 0.05, { smoothing: 2 });
        expect(smoothed?.values[0]).toBeCloseTo(0.4, 5);
        expect(getTempoAlignedFrameMock).toHaveBeenCalledTimes(2);
    });

    it('normalizes non-finite smoothing values when caching samples', () => {
        const first = sampleFeatureFrame('audioTrack', descriptor, 0.05, { smoothing: Number.NaN });
        expect(first?.values[0]).toBeCloseTo(0.3, 5);
        expect(getTempoAlignedFrameMock).toHaveBeenCalledTimes(1);

        const second = sampleFeatureFrame('audioTrack', descriptor, 0.05, {});
        expect(second).toBe(first);
        expect(getTempoAlignedFrameMock).toHaveBeenCalledTimes(1);
    });
});
