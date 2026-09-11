import { beforeEach, describe, expect, it } from 'vitest';
import {
    getAudioFeatureMatrixRevision,
    readAudioFeatureMatrix,
    validateAudioFeatureMatrixSize,
} from '../audioFeatureMatrix';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '../featureTrackIdentity';
import { useTimelineStore } from '@state/timelineStore';

describe('readAudioFeatureMatrix', () => {
    beforeEach(() => useTimelineStore.getState().resetTimeline());

    it('returns packed interpolated values, clip coverage, and a stable session revision', () => {
        const sourceId = 'source';
        const trackId = 'audio';
        const profile = DEFAULT_ANALYSIS_PROFILE_ID;
        const featureKey = buildFeatureTrackKey('spectrogram', profile);
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                [trackId]: {
                    id: trackId,
                    name: 'Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [
                        {
                            id: 'clip',
                            type: 'audio',
                            sourceId,
                            offsetTicks: 0,
                            sourceStartSeconds: 0,
                            sourceEndSeconds: 2,
                        },
                    ],
                },
            },
            tracksOrder: [trackId],
            audioCache: {
                [sourceId]: {
                    durationSeconds: 2,
                    durationSamples: 96_000,
                    sampleRate: 48_000,
                    channels: 1,
                },
            },
            audioFeatureCaches: {
                [sourceId]: {
                    version: 4,
                    audioSourceId: sourceId,
                    hopSeconds: 1,
                    startTimeSeconds: 0,
                    frameCount: 3,
                    analysisParams: {
                        windowSize: 2,
                        hopSize: 1,
                        overlap: 1,
                        sampleRate: 48_000,
                        calculatorVersions: {},
                    },
                    defaultAnalysisProfileId: profile,
                    featureTracks: {
                        [featureKey]: {
                            key: featureKey,
                            calculatorId: 'test',
                            version: 1,
                            frameCount: 3,
                            channels: 2,
                            hopSeconds: 1,
                            startTimeSeconds: 0,
                            format: 'float32',
                            data: new Float32Array([0, 10, 2, 12, 4, 14]),
                            analysisProfileId: profile,
                            metadata: { sampleRate: 48_000, minDecibels: -80 },
                        },
                    },
                },
            },
        }));

        const request = {
            trackId,
            featureKey: 'spectrogram',
            startSeconds: -0.5,
            stepSeconds: 0.5,
            frameCount: 5,
            interpolation: 'linear' as const,
        };
        const first = readAudioFeatureMatrix(useTimelineStore.getState(), request)!;
        const second = readAudioFeatureMatrix(useTimelineStore.getState(), request)!;

        expect(first.valuesPerFrame).toBe(2);
        expect([...first.coverage]).toEqual([0, 1, 1, 1, 1]);
        expect([...first.data]).toEqual([-80, -80, 0, 10, 1, 11, 2, 12, 3, 13]);
        expect(first.revision).toBe(second.revision);
        expect(first.sourceFormat).toBe('float32');
        expect(first.sampleRate).toBe(48_000);
    });

    it('rejects matrices above the scalar safety limit', () => {
        expect(() => validateAudioFeatureMatrixSize(524_289, 2)).toThrow(/1048576/);
        expect(validateAudioFeatureMatrixSize(524_288, 2)).toBe(1_048_576);
    });

    it('changes revision when source metadata arrives after its feature cache', () => {
        const sourceId = 'source';
        const trackId = 'audio';
        const profile = DEFAULT_ANALYSIS_PROFILE_ID;
        const featureKey = buildFeatureTrackKey('spectrogram', profile);
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                [trackId]: {
                    id: trackId,
                    name: 'Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [{ id: 'clip', type: 'audio', sourceId, offsetTicks: 0 }],
                },
            },
            tracksOrder: [trackId],
            audioFeatureCaches: {
                [sourceId]: {
                    version: 4,
                    audioSourceId: sourceId,
                    hopSeconds: 1,
                    startTimeSeconds: 0,
                    frameCount: 2,
                    analysisParams: {
                        windowSize: 2,
                        hopSize: 1,
                        overlap: 1,
                        sampleRate: 48_000,
                        calculatorVersions: {},
                    },
                    defaultAnalysisProfileId: profile,
                    featureTracks: {
                        [featureKey]: {
                            key: featureKey,
                            calculatorId: 'test',
                            version: 1,
                            frameCount: 2,
                            channels: 1,
                            hopSeconds: 1,
                            startTimeSeconds: 0,
                            format: 'float32',
                            data: new Float32Array([1, 2]),
                            analysisProfileId: profile,
                        },
                    },
                },
            },
        }));

        const beforeHydration = getAudioFeatureMatrixRevision(useTimelineStore.getState(), trackId, 'spectrogram');
        useTimelineStore.setState((state) => ({
            ...state,
            audioCache: {
                [sourceId]: { durationSeconds: 2, durationSamples: 96_000, sampleRate: 48_000, channels: 1 },
            },
        }));
        const afterHydration = getAudioFeatureMatrixRevision(useTimelineStore.getState(), trackId, 'spectrogram');

        expect(beforeHydration).not.toBeNull();
        expect(afterHydration).not.toBe(beforeHydration);
    });
});
