import { describe, expect, it } from 'vitest';
import {
    buildFeatureTrackKey,
    resolveFeatureTrackFromCache,
    type ResolveFeatureTrackOptions,
} from '@audio/features/featureTrackIdentity';

const makeTrack = (key: string) =>
    ({
        key,
        calculatorId: 'test.calc',
        version: 1,
        frameCount: 16,
        channels: 1,
        hopSeconds: 0.01,
        startTimeSeconds: 0,
        data: new Float32Array(16),
        format: 'float32',
        analysisProfileId: key.includes(':') ? key.split(':').at(-1) ?? null : null,
    } as any);

describe('resolveFeatureTrackFromCache', () => {
    const featureKey = 'spectrogram';
    const defaultKey = buildFeatureTrackKey(featureKey, 'default');
    const adhocKey = buildFeatureTrackKey(featureKey, 'adhoc-profile');
    const cache = {
        featureTracks: {
            [defaultKey]: makeTrack(defaultKey),
            [adhocKey]: makeTrack(adhocKey),
        },
        defaultAnalysisProfileId: 'default',
    } as const;

    const resolve = (options: ResolveFeatureTrackOptions = {}) =>
        resolveFeatureTrackFromCache(cache, featureKey, options);

    it('prefers explicitly requested profiles when available', () => {
        const { key, track } = resolve({ analysisProfileId: 'adhoc-profile' });
        expect(key).toBe(adhocKey);
        expect(track?.analysisProfileId).toBe('adhoc-profile');
    });

    it('skips fallback resolution when strict profile matching is enabled', () => {
        const { key } = resolve({ analysisProfileId: 'missing-profile', strictProfileMatching: true });
        expect(key).toBe(buildFeatureTrackKey(featureKey, 'missing-profile'));
    });

    it('continues to fall back to defaults when strict matching is not requested', () => {
        const { key } = resolve({ analysisProfileId: 'missing-profile' });
        expect(key).toBe(defaultKey);
    });
});
