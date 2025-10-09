import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import {
    selectAudioFeatureFrame,
    sampleAudioFeatureRange,
} from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { getTempoAlignedFrame } from '@audio/features/tempoAlignedViewAdapter';

function createCache(trackId: string): AudioFeatureCache {
    const frameCount = 6;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    const data = Float32Array.from({ length: frameCount }, (_, index) => index / frameCount);
    return {
        version: 2,
        audioSourceId: trackId,
        hopSeconds,
        hopTicks,
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
                data,
            },
        },
    };
}

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {
            audioTrack: {
                id: 'audioTrack',
                name: 'Track',
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
    const cache = createCache('audioTrack');
    useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', cache);
});

describe('audio feature sampling selectors', () => {
    it('interpolates scalar frame values by tick', () => {
        const state = useTimelineStore.getState();
        const tick = 60; // halfway to first frame
        const sample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tick);
        expect(sample).toBeDefined();
        expect(sample?.frameIndex).toBe(0);
        expect(sample?.values[0]).toBeCloseTo(0.5 / 6, 5);
    });

    it('pads frame sampling with silence before the track start', () => {
        const state = useTimelineStore.getState();
        const tick = -120; // one frame before start
        const sample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tick);
        expect(sample).toBeDefined();
        expect(sample?.values[0]).toBe(0);
    });

    it('pads frame sampling with silence after the track end', () => {
        const state = useTimelineStore.getState();
        const tick = 840; // one frame after last sample
        const sample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tick);
        expect(sample).toBeDefined();
        expect(sample?.values[0]).toBe(0);
    });

    it('averages neighbours when smoothing is applied', () => {
        const state = useTimelineStore.getState();
        const tick = 120; // exactly frame 1
        const sample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tick, { smoothing: 1 });
        expect(sample).toBeDefined();
        expect(sample?.values[0]).toBeCloseTo((1 / 6 + 2 / 6 + 0 / 6) / 3, 5);
    });

    it('supports hold interpolation', () => {
        const state = useTimelineStore.getState();
        const tick = 60;
        const sample = selectAudioFeatureFrame(state, 'audioTrack', 'rms', tick, { interpolation: 'hold' });
        expect(sample).toBeDefined();
        expect(sample?.frameIndex).toBe(0);
        expect(sample?.values[0]).toBeCloseTo(0, 5);
    });

    it('samples a range of frames for visualization', () => {
        const state = useTimelineStore.getState();
        const range = sampleAudioFeatureRange(state, 'audioTrack', 'rms', 0, 360);
        expect(range).toBeDefined();
        expect(range?.frameCount).toBeGreaterThan(0);
        expect(range?.channels).toBe(1);
        expect(range?.data.length).toBe(range?.frameCount ?? 0);
        expect(range?.frameTicks.length).toBe(range?.frameCount ?? 0);
        expect(range?.windowStartTick).toBeLessThan(range?.windowEndTick ?? 0);
        expect(range?.trackStartTick).toBe(0);
        expect(range?.trackEndTick).toBeGreaterThan(range?.trackStartTick ?? -1);
    });

    it('includes silence when sampling ranges beyond track bounds', () => {
        const state = useTimelineStore.getState();
        const range = sampleAudioFeatureRange(state, 'audioTrack', 'rms', 720, 960);
        expect(range).toBeDefined();
        expect(range?.frameCount).toBe(3);
        expect(Array.from(range?.data ?? [])).toEqual([0, 0, 0]);
        expect(range?.frameTicks.length).toBe(range?.frameCount ?? 0);
        expect(range?.windowStartTick).toBeLessThanOrEqual(range?.windowEndTick ?? 0);
        expect(range?.windowEndTick).toBeGreaterThanOrEqual(range?.trackEndTick ?? 0);
    });

    it('computes spline interpolation values with diagnostics', () => {
        const customData = new Float32Array([0, 1, -1, 1, -1, 1]);
        const cache = createCache('altTrack');
        cache.audioSourceId = 'altTrack';
        cache.featureTracks.rms.data = customData;
        cache.featureTracks.rms.frameCount = customData.length;
        cache.frameCount = customData.length;
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                ...state.tracks,
                altTrack: {
                    id: 'altTrack',
                    name: 'Alt',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: [...state.tracksOrder, 'altTrack'],
        }));
        useTimelineStore.getState().ingestAudioFeatureCache('altTrack', cache);
        const state = useTimelineStore.getState();
        const tick = 300; // midway between frame 2 and 3
        const result = getTempoAlignedFrame(state, {
            trackId: 'altTrack',
            featureKey: 'rms',
            tick,
            options: { interpolation: 'spline' },
        });
        expect(result.sample).toBeDefined();
        const expected = 0.5 * (
            2 * customData[2] +
            (-customData[1] + customData[3]) * 0.5 +
            (2 * customData[1] - 5 * customData[2] + 4 * customData[3] - customData[4]) * 0.25 +
            (-customData[1] + 3 * customData[2] - 3 * customData[3] + customData[4]) * 0.125
        );
        expect(result.sample?.values[0]).toBeCloseTo(expected, 5);
        expect(result.diagnostics.mapperDurationNs).toBeGreaterThan(0);
    });

    it('falls back to legacy sampling when the adapter is disabled', () => {
        const store = useTimelineStore.getState();
        store.setHybridCacheAdapterEnabled(false, 'test-disable');
        const nextState = useTimelineStore.getState();
        expect(nextState.hybridCacheRollout.adapterEnabled).toBe(false);
        const result = getTempoAlignedFrame(nextState, {
            trackId: 'audioTrack',
            featureKey: 'rms',
            tick: 120,
        });
        expect(result.sample).toBeDefined();
        expect(result.diagnostics.fallbackReason).toBe('adapter-disabled');
        expect(result.diagnostics.cacheHit).toBe(true);
    });
});
