import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame, getTempoAlignedRange } from '@audio/features/tempoAlignedViewAdapter';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '@audio/features/featureTrackIdentity';
import type { AudioFeatureCache, AudioFeatureTrack } from '@audio/features/audioFeatureTypes';

const HOP_TICKS = 120;
const HOP_SECONDS = HOP_TICKS / 1920;
const DEFAULT_PROFILE = DEFAULT_ANALYSIS_PROFILE_ID;

const BASE_PROFILE = {
    id: DEFAULT_PROFILE,
    windowSize: 256,
    hopSize: 128,
    overlap: 2,
    sampleRate: 48000,
    smoothing: null,
    fftSize: null,
    minDecibels: null,
    maxDecibels: null,
    window: null,
} as const;

function registerAudioTrack(trackId: string) {
    useTimelineStore.setState((state) => {
        const nextOrder = state.tracksOrder.includes(trackId) ? state.tracksOrder : [...state.tracksOrder, trackId];
        return {
            ...state,
            tracks: {
                ...state.tracks,
                [trackId]: {
                    id: trackId,
                    name: trackId,
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: nextOrder,
        };
    });
}

function createCache(trackId: string, track: AudioFeatureTrack): AudioFeatureCache {
    return {
        version: 3,
        audioSourceId: trackId,
        hopSeconds: track.hopSeconds,
        hopTicks: track.hopTicks,
        startTimeSeconds: track.startTimeSeconds,
        tempoProjection: track.tempoProjection ?? { hopTicks: track.hopTicks ?? HOP_TICKS, startTick: 0 },
        frameCount: track.frameCount,
        analysisParams: {
            windowSize: 256,
            hopSize: 128,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: {
                [track.calculatorId]: track.version,
            },
        },
        featureTracks: {
            [track.key]: track,
        },
        analysisProfiles: {
            [DEFAULT_PROFILE]: BASE_PROFILE,
        },
        defaultAnalysisProfileId: DEFAULT_PROFILE,
        channelAliases: null,
    };
}

function ingestTrack(trackId: string, track: AudioFeatureTrack) {
    registerAudioTrack(trackId);
    const cache = createCache(trackId, track);
    useTimelineStore.getState().ingestAudioFeatureCache(trackId, cache);
}

describe('tempoAlignedViewAdapter silence padding', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
    });

    it('returns silent spectrogram frames with consistent channel sizes outside the analysed range', () => {
        const trackId = 'spectrogram-track';
        const featureKey = 'spectrogram';
        const trackKey = buildFeatureTrackKey(featureKey, DEFAULT_PROFILE);
        const channels = 3;
        const frameCount = 4;
        const data = Float32Array.from({ length: frameCount * channels }, (_, index) => index / 10);

        ingestTrack(trackId, {
            key: trackKey,
            calculatorId: 'test.spectrogram',
            version: 1,
            frameCount,
            channels,
            hopTicks: HOP_TICKS,
            hopSeconds: HOP_SECONDS,
            startTimeSeconds: 0,
            tempoProjection: { hopTicks: HOP_TICKS, startTick: 0 },
            format: 'float32',
            data,
            analysisProfileId: DEFAULT_PROFILE,
            channelAliases: null,
        } as AudioFeatureTrack);

        const state = useTimelineStore.getState();
        const { sample } = getTempoAlignedFrame(state, {
            trackId,
            featureKey,
            tick: -HOP_TICKS,
        });

        expect(sample).toBeDefined();
        expect(sample?.values).toHaveLength(channels);
        expect(sample?.values.every((value) => value === 0)).toBe(true);
        expect(sample?.channelValues).toHaveLength(channels);
        sample?.channelValues.forEach((channel) => {
            expect(channel).toHaveLength(1);
            expect(channel.every((value) => value === 0)).toBe(true);
        });
    });

    it('pads waveform-minmax frames with silent extrema when sampling beyond the cache', () => {
        const trackId = 'waveform-track';
        const featureKey = 'waveform';
        const trackKey = buildFeatureTrackKey(featureKey, DEFAULT_PROFILE);
        const channels = 2;
        const frameCount = 5;
        const minValues = Float32Array.from({ length: frameCount * channels }, () => -0.5);
        const maxValues = Float32Array.from({ length: frameCount * channels }, () => 0.5);

        ingestTrack(trackId, {
            key: trackKey,
            calculatorId: 'test.waveform',
            version: 1,
            frameCount,
            channels,
            hopTicks: HOP_TICKS,
            hopSeconds: HOP_SECONDS,
            startTimeSeconds: 0,
            tempoProjection: { hopTicks: HOP_TICKS, startTick: 0 },
            format: 'waveform-minmax',
            data: { min: minValues, max: maxValues },
            metadata: { hopSize: 128 },
            analysisProfileId: DEFAULT_PROFILE,
            channelAliases: null,
        } as AudioFeatureTrack);

        const state = useTimelineStore.getState();
        const { sample } = getTempoAlignedFrame(state, {
            trackId,
            featureKey,
            tick: frameCount * HOP_TICKS + HOP_TICKS,
        });

        expect(sample).toBeDefined();
        expect(sample?.values).toHaveLength(channels * 2);
        expect(sample?.values.every((value) => value === 0)).toBe(true);
        expect(sample?.channelValues).toHaveLength(channels);
        sample?.channelValues.forEach((pair) => {
            expect(pair).toHaveLength(2);
            expect(pair.every((value) => value === 0)).toBe(true);
        });
    });

    it('pads waveform-periodic frames using the canonical period length outside analysed bounds', () => {
        const trackId = 'periodic-track';
        const featureKey = 'pitchWaveform';
        const trackKey = buildFeatureTrackKey(featureKey, DEFAULT_PROFILE);
        const frameCount = 4;
        const frameLength = 6;
        const offsets = [0, frameLength, frameLength * 2, frameLength * 3];
        const lengths = [frameLength, frameLength - 1, frameLength, frameLength - 2];
        const data = Float32Array.from({ length: frameLength * frameCount }, (_, index) => Math.sin(index));

        ingestTrack(trackId, {
            key: trackKey,
            calculatorId: 'test.pitchWaveform',
            version: 1,
            frameCount,
            channels: 1,
            hopTicks: HOP_TICKS,
            hopSeconds: HOP_SECONDS,
            startTimeSeconds: 0,
            tempoProjection: { hopTicks: HOP_TICKS, startTick: 0 },
            format: 'waveform-periodic',
            data,
            metadata: {
                frameOffsets: offsets,
                frameLengths: lengths,
                maxFrameLength: frameLength,
            },
            analysisProfileId: DEFAULT_PROFILE,
            channelAliases: null,
        } as AudioFeatureTrack);

        const state = useTimelineStore.getState();
        const { sample } = getTempoAlignedFrame(state, {
            trackId,
            featureKey,
            tick: frameCount * HOP_TICKS + HOP_TICKS,
        });

        expect(sample).toBeDefined();
        expect(sample?.values).toHaveLength(frameLength);
        expect(sample?.channelValues).toHaveLength(1);
        expect(sample?.channelValues[0]).toHaveLength(frameLength);
        expect(sample?.channelValues[0]?.every((value) => value === 0)).toBe(true);
        expect(sample?.frameLength).toBe(frameLength);
    });

    it('fills tempo-aligned ranges with silent waveform-periodic frames past the cache tail', () => {
        const trackId = 'periodic-range-track';
        const featureKey = 'pitchWaveform';
        const trackKey = buildFeatureTrackKey(featureKey, DEFAULT_PROFILE);
        const frameCount = 3;
        const frameLength = 8;
        const offsets = [0, frameLength, frameLength * 2];
        const lengths = [frameLength, frameLength, frameLength - 3];
        const data = Float32Array.from({ length: frameLength * frameCount }, (_, index) => index / 10);

        ingestTrack(trackId, {
            key: trackKey,
            calculatorId: 'test.pitchWaveform.range',
            version: 1,
            frameCount,
            channels: 1,
            hopTicks: HOP_TICKS,
            hopSeconds: HOP_SECONDS,
            startTimeSeconds: 0,
            tempoProjection: { hopTicks: HOP_TICKS, startTick: 0 },
            format: 'waveform-periodic',
            data,
            metadata: {
                frameOffsets: offsets,
                frameLengths: lengths,
                maxFrameLength: frameLength,
            },
            analysisProfileId: DEFAULT_PROFILE,
            channelAliases: null,
        } as AudioFeatureTrack);

        const state = useTimelineStore.getState();
        const { range } = getTempoAlignedRange(state, {
            trackId,
            featureKey,
            startTick: frameCount * HOP_TICKS,
            endTick: frameCount * HOP_TICKS + HOP_TICKS,
        });

        expect(range).toBeDefined();
        const expectedWidth = frameLength;
        expect(range?.channels).toBe(expectedWidth);
        expect(range?.data.length).toBe((range?.frameCount ?? 0) * expectedWidth);
        expect(Array.from(range?.data ?? [])).toEqual(new Array(range?.data.length ?? 0).fill(0));
    });
});
