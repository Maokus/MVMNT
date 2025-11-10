import { describe, expect, it } from 'vitest';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { mergeFeatureCaches } from '../featureCacheUtils';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '@audio/features/featureTrackIdentity';

function createCache(options: {
    sourceId: string;
    featureKey: string;
    calculatorId: string;
    frameCount?: number;
    hopTicks?: number;
    version?: number;
    calculatorVersion?: number;
}): AudioFeatureCache {
    const frameCount = options.frameCount ?? 8;
    const hopTicks = options.hopTicks ?? 120;
    const hopSeconds = hopTicks / 1920;
    const channelAliases = ['Mono'];
    const analysisProfiles = {
        default: {
            id: 'default',
            windowSize: 256,
            hopSize: 128,
            overlap: 2,
            sampleRate: 48000,
        },
    };
    const defaultProfile = DEFAULT_ANALYSIS_PROFILE_ID;
    const compositeKey = buildFeatureTrackKey(options.featureKey, defaultProfile);
    return {
        version: options.version ?? 2,
        audioSourceId: options.sourceId,
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
            calculatorVersions: {
                [options.calculatorId]: options.calculatorVersion ?? 1,
            },
        },
        featureTracks: {
            [compositeKey]: {
                key: compositeKey,
                calculatorId: options.calculatorId,
                version: options.calculatorVersion ?? 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data: new Float32Array(frameCount),
                channelAliases,
                analysisProfileId: defaultProfile,
            },
        },
        analysisProfiles,
        defaultAnalysisProfileId: defaultProfile,
        channelAliases,
    };
}

describe('mergeFeatureCaches', () => {
    it('returns incoming cache when no existing cache is present', () => {
        const incoming = createCache({
            sourceId: 'aud1',
            featureKey: 'spectrogram',
            calculatorId: 'mvmnt.spectrogram',
        });
        const merged = mergeFeatureCaches(undefined, incoming);
        const compositeKey = buildFeatureTrackKey(
            'spectrogram',
            incoming.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID
        );
        expect(merged).not.toBe(incoming);
        expect(Object.keys(merged.featureTracks)).toEqual([compositeKey]);
        expect(merged.featureTracks[compositeKey]).toBe(incoming.featureTracks[compositeKey]);
    });

    it('merges feature tracks and analysis metadata', () => {
        const existing = createCache({
            sourceId: 'aud1',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
            frameCount: 16,
        });
        const incoming = createCache({
            sourceId: 'aud1',
            featureKey: 'spectrogram',
            calculatorId: 'mvmnt.spectrogram',
            frameCount: 8,
            hopTicks: 180,
            version: 3,
            calculatorVersion: 3,
        });
        const merged = mergeFeatureCaches(existing, incoming);
        const defaultProfile = existing.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
        const rmsKey = buildFeatureTrackKey('rms', defaultProfile);
        const spectrogramKey = buildFeatureTrackKey(
            'spectrogram',
            incoming.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID
        );
        expect(merged.featureTracks[rmsKey]).toBe(existing.featureTracks[rmsKey]);
        expect(merged.featureTracks[spectrogramKey]).toBe(incoming.featureTracks[spectrogramKey]);
        expect(merged.version).toBe(3);
        expect(merged.hopTicks).toBe(180);
        expect(merged.frameCount).toBe(8);
        expect(merged.analysisParams.calculatorVersions).toMatchObject({
            'mvmnt.rms': 1,
            'mvmnt.spectrogram': 3,
        });
    });

    it('replaces feature tracks with matching keys from the incoming cache', () => {
        const existing = createCache({
            sourceId: 'aud1',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
        });
        const incoming = createCache({
            sourceId: 'aud1',
            featureKey: 'rms',
            calculatorId: 'mvmnt.rms',
            calculatorVersion: 5,
        });
        const merged = mergeFeatureCaches(existing, incoming);
        const defaultProfile = incoming.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
        const rmsKey = buildFeatureTrackKey('rms', defaultProfile);
        expect(merged.featureTracks[rmsKey]).toBe(incoming.featureTracks[rmsKey]);
        expect(merged.analysisParams.calculatorVersions['mvmnt.rms']).toBe(5);
    });
});
