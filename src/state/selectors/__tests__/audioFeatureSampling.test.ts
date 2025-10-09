import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import {
    selectAudioFeatureFrame,
    sampleAudioFeatureRange,
} from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createCache(trackId: string): AudioFeatureCache {
    const frameCount = 6;
    const hopTicks = 120;
    const data = Float32Array.from({ length: frameCount }, (_, index) => index / frameCount);
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds: 0.05,
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
                hopSeconds: 0.05,
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
});
