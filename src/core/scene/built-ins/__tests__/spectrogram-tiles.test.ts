import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildSpectrogramTileKey,
    clearSpectrogramTileCacheForTests,
    getSpectrogramTile,
    getSpectrogramTileRange,
    SpectrogramTileCache,
    type SpectrogramTileRequest,
} from '@core/scene/built-ins/audio-displays/spectrogram-tiles';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '@audio/features/featureTrackIdentity';

class MockImageData {
    constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
    ) {}
}

class MockOffscreenCanvas {
    readonly context = { putImageData: vi.fn() };

    constructor(
        readonly width: number,
        readonly height: number
    ) {}

    getContext(): typeof this.context {
        return this.context;
    }
}

describe('spectrogram tile resources', () => {
    beforeEach(() => {
        vi.stubGlobal('ImageData', MockImageData);
        vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
        clearSpectrogramTileCacheForTests();
        useTimelineStore.getState().resetTimeline();
    });

    afterEach(() => {
        clearSpectrogramTileCacheForTests();
        useTimelineStore.getState().resetTimeline();
        vi.unstubAllGlobals();
    });

    it('memoizes immutable resources without changing their generated content', () => {
        const cache = new SpectrogramTileCache();
        const build = vi.fn(() => new Uint8ClampedArray(2 * 2 * 4).fill(42));

        const cold = cache.getOrCreate('same-inputs', 2, 2, build);
        const warm = cache.getOrCreate('same-inputs', 2, 2, build);

        expect(warm).toBe(cold);
        expect(build).toHaveBeenCalledTimes(1);
        expect(Object.isFrozen(cold)).toBe(true);
        expect(cache.getStats()).toEqual({ entries: 1, retainedBytes: 16 });
    });

    it('evicts least-recently-used tiles without changing regenerated pixels', () => {
        const cache = new SpectrogramTileCache(16);
        const firstPixels = new Uint8ClampedArray(16).fill(7);
        const buildFirst = vi.fn(() => firstPixels.slice());

        cache.getOrCreate('first', 2, 2, buildFirst);
        cache.getOrCreate('second', 2, 2, () => new Uint8ClampedArray(16).fill(9));
        const regenerated = cache.getOrCreate('first', 2, 2, buildFirst);

        expect(buildFirst).toHaveBeenCalledTimes(2);
        expect(cache.getStats()).toEqual({ entries: 1, retainedBytes: 16 });
        expect((regenerated.drawable as unknown as MockOffscreenCanvas).context.putImageData).toHaveBeenCalledTimes(1);
    });

    it('derives tile ranges solely from the requested time window', () => {
        const forward = getSpectrogramTileRange(1.25, 8.75, 0.01);
        const reversed = getSpectrogramTileRange(8.75, 1.25, 0.01);

        expect(reversed).toEqual(forward);
        expect(getSpectrogramTileRange(-0.01, 0.01, 0.01)).toEqual({
            firstTile: -1,
            lastTile: 0,
        });
    });

    it('bounds steady-state tile generation by crossed boundaries rather than rendered frames', () => {
        const fps = 60;
        const stepSeconds = 6 / 511;
        const touchedTiles = new Set<number>();
        for (let frame = 0; frame < 10 * fps; frame += 1) {
            const targetTime = 10 + frame / fps;
            const { firstTile, lastTile } = getSpectrogramTileRange(targetTime - 3, targetTime, stepSeconds);
            for (let tile = firstTile; tile <= lastTile; tile += 1) touchedTiles.add(tile);
        }

        expect(touchedTiles.size).toBeLessThanOrEqual(11);
        expect(touchedTiles.size).toBeLessThan(10 * fps);
    });

    it('includes every pixel-affecting presentation input in the cache key', () => {
        const request: SpectrogramTileRequest = {
            trackId: 'track',
            tileIndex: 3,
            stepSeconds: 0.01,
            rows: 128,
            sampleRate: 44100,
            scale: 'log',
            minFrequency: 20,
            maxFrequency: 20000,
            minDecibels: -80,
            maxDecibels: 0,
            gain: 1,
            colorMap: 'viridis',
        };
        const base = buildSpectrogramTileKey('revision-a', request);

        expect(buildSpectrogramTileKey('revision-b', request)).not.toBe(base);
        for (const [key, value] of [
            ['tileIndex', 4],
            ['stepSeconds', 0.02],
            ['rows', 64],
            ['sampleRate', 48000],
            ['scale', 'mel'],
            ['minFrequency', 40],
            ['maxFrequency', 16000],
            ['minDecibels', -100],
            ['maxDecibels', -3],
            ['gain', 2],
            ['colorMap', 'magma'],
        ] as const) {
            expect(buildSpectrogramTileKey('revision-a', { ...request, [key]: value })).not.toBe(base);
        }
        expect(
            buildSpectrogramTileKey('revision-a', {
                ...request,
                colorMap: 'custom',
                customColors: ['#000000', '#111111', '#222222'],
            })
        ).not.toBe(
            buildSpectrogramTileKey('revision-a', {
                ...request,
                colorMap: 'custom',
                customColors: ['#000000', '#111111', '#333333'],
            })
        );
    });

    it('invalidates cached tiles when the backing feature track is replaced', () => {
        const sourceId = 'source';
        const trackId = 'track';
        useTimelineStore.setState((state) => ({
            ...state,
            audioCache: {
                [sourceId]: {
                    durationSeconds: 2,
                    durationSamples: 88200,
                    sampleRate: 44100,
                    channels: 1,
                },
            },
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
        }));

        const makeCache = (value: number): AudioFeatureCache => {
            const profile = DEFAULT_ANALYSIS_PROFILE_ID;
            const key = buildFeatureTrackKey('spectrogram', profile);
            return {
                version: 4,
                audioSourceId: sourceId,
                hopSeconds: 0.5,
                hopTicks: 960,
                startTimeSeconds: 0,
                frameCount: 4,
                analysisParams: {
                    windowSize: 4,
                    hopSize: 2,
                    overlap: 2,
                    sampleRate: 44100,
                    calculatorVersions: { 'mvmnt.spectrogram': 3 },
                },
                featureTracks: {
                    [key]: {
                        key,
                        calculatorId: 'mvmnt.spectrogram',
                        version: 3,
                        frameCount: 4,
                        channels: 2,
                        hopSeconds: 0.5,
                        hopTicks: 960,
                        startTimeSeconds: 0,
                        format: 'float32',
                        data: new Float32Array(8).fill(value),
                        metadata: { minDecibels: -80, maxDecibels: 0, sampleRate: 44100 },
                        analysisProfileId: profile,
                    },
                },
                defaultAnalysisProfileId: profile,
            };
        };
        const request: SpectrogramTileRequest = {
            trackId,
            tileIndex: 0,
            stepSeconds: 0.5,
            rows: 2,
            sampleRate: 44100,
            scale: 'linear',
            minFrequency: 0,
            maxFrequency: 22050,
            minDecibels: -80,
            maxDecibels: 0,
            gain: 1,
            colorMap: 'grayscale',
        };

        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, makeCache(-60));
        const first = getSpectrogramTile(request);
        expect(getSpectrogramTile(request)).toBe(first);

        const beforeScene = getSpectrogramTile({ ...request, tileIndex: -1 });
        const beforeSceneImage = (beforeScene?.drawable as unknown as MockOffscreenCanvas).context.putImageData.mock
            .calls[0]?.[0] as MockImageData;
        // Timeline time before 0 is supplied by the feature matrix as its silent floor,
        // not treated as a missing/transparent tile column.
        expect(beforeSceneImage.data[3]).toBe(255);

        useTimelineStore.getState().ingestAudioFeatureCache(sourceId, makeCache(-20));
        const replaced = getSpectrogramTile(request);

        expect(first).not.toBeNull();
        expect(replaced).not.toBeNull();
        expect(replaced).not.toBe(first);
    });

    it('does not retain a tile after an imported document clears render resources', () => {
        const cache = new SpectrogramTileCache();
        const first = cache.getOrCreate('document-a', 2, 2, () => new Uint8ClampedArray(16).fill(10));

        cache.clear();

        const restored = cache.getOrCreate('document-a', 2, 2, () => new Uint8ClampedArray(16).fill(20));
        expect(restored).not.toBe(first);
        expect((restored.drawable as unknown as MockOffscreenCanvas).context.putImageData).toHaveBeenCalledTimes(1);
    });
});
