import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame } from '../tempoAlignedViewAdapter';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '../featureTrackIdentity';
import type { AudioFeatureCache } from '../audioFeatureTypes';

const PROFILE = DEFAULT_ANALYSIS_PROFILE_ID;

function cacheFor(sourceId: string, offset: number): AudioFeatureCache {
    const key = buildFeatureTrackKey('rms', PROFILE);
    return {
        version: 3,
        audioSourceId: sourceId,
        hopSeconds: 0.5,
        hopTicks: 960,
        startTimeSeconds: 0,
        frameCount: 7,
        analysisParams: { windowSize: 1, hopSize: 1, overlap: 1, sampleRate: 48000, calculatorVersions: {} },
        featureTracks: {
            [key]: {
                key,
                calculatorId: 'test.rms',
                version: 1,
                frameCount: 7,
                channels: 1,
                hopSeconds: 0.5,
                hopTicks: 960,
                startTimeSeconds: 0,
                format: 'float32',
                data: Float32Array.from({ length: 7 }, (_, index) => offset + index),
                analysisProfileId: PROFILE,
            },
        },
        analysisProfiles: {},
        defaultAnalysisProfileId: PROFILE,
    };
}

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.setState((state) => ({
        ...state,
        audioCache: {
            sourceA: {
                durationSeconds: 3,
                durationTicks: 5760,
                sampleRate: 48000,
                channels: 1,
                durationSamples: 144000,
            },
            sourceB: {
                durationSeconds: 3,
                durationTicks: 5760,
                sampleRate: 48000,
                channels: 1,
                durationSamples: 144000,
            },
        },
        tracks: {
            clips: {
                id: 'clips',
                name: 'Clips',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [
                    {
                        id: 'a',
                        type: 'audio',
                        sourceId: 'sourceA',
                        offsetTicks: 0,
                        sourceStartSeconds: 0,
                        sourceEndSeconds: 1,
                    },
                    {
                        id: 'b',
                        type: 'audio',
                        sourceId: 'sourceB',
                        offsetTicks: 3840,
                        sourceStartSeconds: 0,
                        sourceEndSeconds: 1,
                    },
                ],
            },
            first: {
                id: 'first',
                name: 'First',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [
                    {
                        id: 'firstClip',
                        type: 'audio',
                        sourceId: 'sourceA',
                        offsetTicks: 0,
                        sourceStartSeconds: 0,
                        sourceEndSeconds: 3,
                    },
                ],
            },
            later: {
                id: 'later',
                name: 'Later',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [
                    {
                        id: 'laterClip',
                        type: 'audio',
                        sourceId: 'sourceA',
                        offsetTicks: 3840,
                        sourceStartSeconds: 0,
                        sourceEndSeconds: 3,
                    },
                ],
            },
        },
        tracksOrder: ['clips', 'first', 'later'],
    }));
    useTimelineStore.getState().ingestAudioFeatureCache('sourceA', cacheFor('sourceA', 0));
    useTimelineStore.getState().ingestAudioFeatureCache('sourceB', cacheFor('sourceB', 10));
});

describe('clip-aware feature sampling', () => {
    it('samples each clip source at its source-local time and returns silence in a gap', () => {
        const state = useTimelineStore.getState();
        expect(getTempoAlignedFrame(state, { trackId: 'clips', featureKey: 'rms', tick: 960 }).sample?.values[0]).toBe(
            1
        );
        expect(getTempoAlignedFrame(state, { trackId: 'clips', featureKey: 'rms', tick: 4800 }).sample?.values[0]).toBe(
            11
        );
        expect(getTempoAlignedFrame(state, { trackId: 'clips', featureKey: 'rms', tick: 2880 }).sample?.values[0]).toBe(
            0
        );
    });

    it('does not reuse a shared source sample across differently placed tracks', () => {
        const state = useTimelineStore.getState();
        // At 2.5s, the first track is at source 2.5s while the later clip is at source 0.5s.
        expect(getTempoAlignedFrame(state, { trackId: 'first', featureKey: 'rms', tick: 4800 }).sample?.values[0]).toBe(
            5
        );
        expect(getTempoAlignedFrame(state, { trackId: 'later', featureKey: 'rms', tick: 4800 }).sample?.values[0]).toBe(
            1
        );
    });
});
