import { describe, expect, it, beforeEach } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-spectrum';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-volume-meter';
import { AudioOscilloscopeElement } from '@core/scene/elements/audio-oscilloscope';
import { ConstantBinding, AudioFeatureBinding } from '@bindings/property-bindings';
import { Poly } from '@core/render/render-objects';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createWaveformCache(trackId: string): AudioFeatureCache {
    const frameCount = 32;
    const hopTicks = 60;
    const min = new Float32Array(frameCount).fill(-0.5);
    const max = new Float32Array(frameCount).fill(0.5);
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds: 0.02,
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
                hopSeconds: 0.02,
                format: 'waveform-minmax',
                data: { min, max },
            },
        },
    };
}

function createSpectrogramCache(trackId: string): AudioFeatureCache {
    const frameCount = 3;
    const hopTicks = 120;
    const hopSeconds = 0.25;
    const channels = 8;
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds,
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
    const hopSeconds = 0.25;
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds,
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
        const hopSeconds = tm.ticksToSeconds(cache.hopTicks);
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
        const hopSeconds = tm.ticksToSeconds(cache.hopTicks);
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
});
