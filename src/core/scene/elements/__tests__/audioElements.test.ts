import { describe, expect, it, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-spectrum';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-volume-meter';
import { AudioOscilloscopeElement } from '@core/scene/elements/audio-oscilloscope';
import { ConstantBinding, AudioFeatureBinding } from '@bindings/property-bindings';
import { Poly, Text } from '@core/render/render-objects';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

let originalCanvasGetContext: ((contextId: string) => any) | undefined;

beforeAll(() => {
    originalCanvasGetContext = (HTMLCanvasElement.prototype as any).getContext;
    (HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ({
        measureText: () => ({ width: 10 }),
    }));
});

afterAll(() => {
    (HTMLCanvasElement.prototype as any).getContext = originalCanvasGetContext;
});

function createWaveformCache(trackId: string): AudioFeatureCache {
    const frameCount = 32;
    const hopTicks = 60;
    const hopSeconds = hopTicks / 1920;
    const min = new Float32Array(frameCount);
    const max = new Float32Array(frameCount);
    const denom = Math.max(1, frameCount - 1);
    for (let i = 0; i < frameCount; i += 1) {
        const t = i / denom;
        const value = -0.8 + t * 1.6;
        min[i] = value;
        max[i] = value;
    }
    return {
        version: 2,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 128,
            hopSize: 64,
            overlap: 2,
            sampleRate: 44100,
            calculatorVersions: { 'mvmnt.waveform': 1 },
        },
        featureTracks: {
            waveform: {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'waveform-minmax',
                data: { min, max },
            },
        },
    };
}

function createSpectrogramCache(trackId: string): AudioFeatureCache {
    const frameCount = 3;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    const channels = 8;
    return {
        version: 2,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 2048,
            hopSize: 512,
            overlap: 4,
            sampleRate: 44100,
            calculatorVersions: { 'test.spectrogram': 2 },
        },
        featureTracks: {
            spectrogram: {
                key: 'spectrogram',
                calculatorId: 'test.spectrogram',
                version: 2,
                frameCount,
                channels,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data: new Float32Array([
                    -70, -62, -58, -50, -42, -35, -20, -10,
                    -65, -55, -48, -40, -30, -22, -15, -6,
                    -60, -50, -46, -38, -32, -24, -18, -8,
                ]),
                metadata: {
                    sampleRate: 44100,
                    fftSize: 2048,
                    minDecibels: -80,
                    maxDecibels: 0,
                },
            },
        },
    };
}

function createRmsCache(trackId: string): AudioFeatureCache {
    const frameCount = 3;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    return {
        version: 2,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 1024,
            hopSize: 512,
            overlap: 2,
            sampleRate: 44100,
            calculatorVersions: { 'test.rms': 1 },
        },
        featureTracks: {
            rms: {
                key: 'rms',
                calculatorId: 'test.rms',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: { hopTicks, startTick: 0 },
                format: 'float32',
                data: new Float32Array([0.1, 0.65, 0.3]),
            },
        },
    };
}

describe('audio scene elements', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                testTrack: {
                    id: 'testTrack',
                    name: 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['testTrack'],
        }));
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', createWaveformCache('testTrack'));
    });

    it('builds bar geometry for spectrum elements', () => {
        const element = new AudioSpectrumElement('spectrum');
        element.updateConfig({
            bandCount: 3,
            sideMode: 'top',
            displayMode: 'bars',
            useLogScale: false,
            startFrequency: 0,
            endFrequency: 22050,
        });
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [-60, -30, -10],
                format: 'float32',
            }),
        );
        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(Array.isArray(container.children)).toBe(true);
        expect(container.children).toHaveLength(4);
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
        expect(container.children.slice(1).every((child: any) => child?.includeInLayoutBounds === false)).toBe(true);
        const heights = container.children.slice(1).map((child: any) => child.height);
        expect(heights.every((value: number) => value > 0)).toBe(true);
    });

    it('updates spectrum bar heights from audio feature samples over time', () => {
        const cache = createSpectrogramCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioSpectrumElement('spectrumDynamic');
        element.updateConfig({
            bandCount: 5,
            displayMode: 'bars',
            sideMode: 'top',
            useLogScale: false,
            startFrequency: 0,
            endFrequency: 22050,
            temporalSmoothing: 0,
        });
        element.setBinding(
            'featureBinding',
            new AudioFeatureBinding({
                trackId: 'testTrack',
                featureKey: 'spectrogram',
                calculatorId: 'test.spectrogram',
                bandIndex: null,
                channelIndex: null,
                smoothing: null,
            }),
        );
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const hopSeconds = tm.ticksToSeconds(hopTicks);
        const first = element.buildRenderObjects({}, 0);
        const second = element.buildRenderObjects({}, hopSeconds);
        const collectHeights = (objects: any[]) => {
            const container = objects[0] as any;
            return (container.children ?? []).slice(1).map((child: any) => child.height);
        };
        const firstHeights = collectHeights(first);
        const secondHeights = collectHeights(second);
        expect(firstHeights).toHaveLength(5);
        expect(secondHeights).toHaveLength(5);
        expect(secondHeights[0]).toBeGreaterThan(firstHeights[0]);
        expect(secondHeights[1]).toBeGreaterThan(firstHeights[1]);
        expect(secondHeights[4]).toBeGreaterThan(firstHeights[4]);
    });

    it('shows minimum spectrum amplitudes before and after the track', () => {
        const cache = createSpectrogramCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                ...state.tracks,
                testTrack: {
                    ...state.tracks.testTrack,
                    offsetTicks: (cache.hopTicks ?? 0) * 2,
                },
            },
        }));
        const element = new AudioSpectrumElement('spectrumSilent');
        element.updateConfig({
            bandCount: 4,
            displayMode: 'bars',
            sideMode: 'top',
            useLogScale: false,
            startFrequency: 0,
            endFrequency: 22050,
        });
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'spectrogram',
            calculatorId: 'test.spectrogram',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        element.setBinding('featureBinding', binding);
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const hopSeconds = tm.ticksToSeconds(hopTicks);
        const offsetSeconds = tm.ticksToSeconds(hopTicks * 2);
        const collectHeights = (objects: any[]) => {
            const container = objects[0] as any;
            return (container.children ?? []).slice(1).map((child: any) => child.height ?? 0);
        };
        const before = element.buildRenderObjects({}, offsetSeconds * 0.5);
        const after = element.buildRenderObjects({}, offsetSeconds + (cache.frameCount + 1) * hopSeconds);
        expect(collectHeights(before).every((value: number) => Math.abs(value) <= 1e-6)).toBe(true);
        expect(collectHeights(after).every((value: number) => Math.abs(value) <= 1e-6)).toBe(true);
    });

    it('applies temporal smoothing to spectrogram bindings', () => {
        const cache = createSpectrogramCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioSpectrumElement('spectrumSmoothing');
        element.updateConfig({ temporalSmoothing: 3 });
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'spectrogram',
            calculatorId: 'test.spectrogram',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        element.setBinding('featureBinding', binding);
        element.buildRenderObjects({}, 0);
        expect(binding.getConfig().smoothing).toBe(3);
        element.updateConfig({ temporalSmoothing: 0 });
        element.buildRenderObjects({}, 0);
        expect(binding.getConfig().smoothing).toBe(0);
    });

    it('builds volume meter rectangles', () => {
        const element = new AudioVolumeMeterElement('meter');
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.75],
                format: 'float32',
            }),
        );
        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
    });

    it('updates volume meter height from audio feature frames', () => {
        const cache = createRmsCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioVolumeMeterElement('meterDynamic');
        element.setBinding(
            'featureBinding',
            new AudioFeatureBinding({
                trackId: 'testTrack',
                featureKey: 'rms',
                calculatorId: 'test.rms',
                bandIndex: null,
                channelIndex: null,
                smoothing: null,
            }),
        );
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const hopSeconds = tm.ticksToSeconds(hopTicks);
        const first = element.buildRenderObjects({}, 0);
        const second = element.buildRenderObjects({}, hopSeconds);
        const getMeterHeight = (objects: any[]) => {
            const container = objects[0] as any;
            const meter = container.children?.[1];
            return meter?.height ?? 0;
        };
        const firstHeight = getMeterHeight(first);
        const secondHeight = getMeterHeight(second);
        expect(firstHeight).toBeGreaterThan(0);
        expect(secondHeight).toBeGreaterThan(firstHeight);
    });

    it('renders volume text when enabled', () => {
        const element = new AudioVolumeMeterElement('meterText');
        element.updateConfig({ showText: true, textLocation: 'bottom' });
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.5],
                format: 'float32',
            }),
        );

        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        const text = container.children?.[2];
        expect(text).toBeInstanceOf(Text);
        expect(text?.text).toContain('dB');
        const layoutRect = container.children?.[0];
        expect(text?.y ?? 0).toBeGreaterThan((layoutRect?.height ?? 0) - 1);
    });

    it('moves track text with meter height', () => {
        const element = new AudioVolumeMeterElement('meterTrackText');
        element.updateConfig({ showText: true, textLocation: 'track' });
        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.25],
                format: 'float32',
            }),
        );

        const first = element.buildRenderObjects({}, 0);
        const firstContainer = first[0] as any;
        const firstText = firstContainer.children?.[2];
        expect(firstText).toBeInstanceOf(Text);

        element.setBinding(
            'featureBinding',
            new ConstantBinding({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 120,
                values: [0.75],
                format: 'float32',
            }),
        );

        const second = element.buildRenderObjects({}, 0);
        const secondContainer = second[0] as any;
        const secondText = secondContainer.children?.[2];
        expect(secondText).toBeInstanceOf(Text);
        expect((secondText?.y as number) < (firstText?.y as number)).toBe(true);
    });

    it('samples waveform data for oscilloscope element', () => {
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'waveform',
            calculatorId: 'mvmnt.waveform',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        const element = new AudioOscilloscopeElement('osc');
        element.setBinding('featureBinding', binding);
        const renderObjects = element.buildRenderObjects({}, 0.25);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(Array.isArray(container.children)).toBe(true);
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
        expect(container.children[1]).toBeInstanceOf(Poly);
        expect(container.children[1]?.includeInLayoutBounds).toBe(false);
    });

    it('aligns the oscilloscope playhead with the window center by default', () => {
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'waveform',
            calculatorId: 'mvmnt.waveform',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        const element = new AudioOscilloscopeElement('oscPlayhead');
        element.updateConfig({ showPlayhead: true, width: 200 });
        element.setBinding('featureBinding', binding);
        const renderObjects = element.buildRenderObjects({}, 0.5);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(container.children).toHaveLength(3);
        const playhead = container.children?.[2];
        expect(playhead).toBeInstanceOf(Poly);
        const [start, end] = playhead?.points ?? [];
        expect(start?.x).toBeCloseTo(100, 5);
        expect(end?.x).toBeCloseTo(100, 5);
    });

    it('positions waveform samples using their actual frame timing', () => {
        const cache = createWaveformCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const waveformTrack = cache.featureTracks.waveform!;
        const waveformData = waveformTrack.data as { min: Float32Array; max: Float32Array };
        const binding = new AudioFeatureBinding({
            trackId: 'testTrack',
            featureKey: 'waveform',
            calculatorId: 'mvmnt.waveform',
            bandIndex: null,
            channelIndex: null,
            smoothing: null,
        });
        const element = new AudioOscilloscopeElement('oscTiming');
        const width = 400;
        const height = 160;
        const tm = getSharedTimingManager();
        const hopTicks = waveformTrack.hopTicks ?? cache.hopTicks ?? 1;
        const windowSeconds = tm.ticksToSeconds(hopTicks * 10);
        element.updateConfig({ windowSeconds, width, height });
        element.setBinding('featureBinding', binding);
        const targetFrameIndex = Math.floor(waveformTrack.frameCount / 2);
        const frameCenterTick = targetFrameIndex * hopTicks + hopTicks / 2;
        const targetSeconds = tm.ticksToSeconds(frameCenterTick);
        const renderObjects = element.buildRenderObjects({}, targetSeconds);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(container.children?.[1]).toBeInstanceOf(Poly);
        const waveform = container.children?.[1] as Poly;
        const points = waveform.points;
        expect(points.length).toBeGreaterThan(2);
        const center = points.reduce<{ point: { x: number; y: number }; distance: number } | null>((acc, point) => {
            const distance = Math.abs(point.x - width / 2);
            if (!acc || distance < acc.distance) {
                return { point, distance };
            }
            return acc;
        }, null);
        expect(center).not.toBeNull();
        if (!center) return;
        const centerPoint = center.point;
        expect(centerPoint.x).toBeLessThanOrEqual(width / 2 + 1);
        expect(centerPoint.x).toBeGreaterThanOrEqual(width / 2 - 1);
        const normalizedValue = (height / 2 - centerPoint.y) / (height / 2);
        const expectedValue = waveformData.min[targetFrameIndex] ?? 0;
        expect(Math.abs(normalizedValue - expectedValue)).toBeLessThan(0.05);
    });
});
