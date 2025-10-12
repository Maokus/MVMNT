import { describe, expect, it, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-spectrum';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-volume-meter';
import { AudioOscilloscopeElement } from '@core/scene/elements/audio-oscilloscope';
import { Arc, Line, Poly, Rectangle, Text } from '@core/render/render-objects';
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
    const analysisProfile = {
        id: 'default',
        windowSize: 128,
        hopSize: 64,
        overlap: 2,
        sampleRate: 44100,
        smoothing: null,
        fftSize: null,
        minDecibels: null,
        maxDecibels: null,
        window: null,
    } as const;
    return {
        version: 3,
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
                analysisProfileId: 'default',
                channelAliases: null,
            },
        },
        analysisProfiles: { default: analysisProfile },
        defaultAnalysisProfileId: 'default',
        channelAliases: undefined,
    };
}

function createSpectrogramCache(trackId: string): AudioFeatureCache {
    const frameCount = 3;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    const channels = 8;
    const analysisProfile = {
        id: 'default',
        windowSize: 2048,
        hopSize: 512,
        overlap: 4,
        sampleRate: 44100,
        smoothing: null,
        fftSize: 2048,
        minDecibels: -80,
        maxDecibels: 0,
        window: 'hann',
    } as const;
    return {
        version: 3,
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
                analysisParams: {
                    fftSize: 2048,
                    windowSize: 2048,
                    hopSize: 512,
                    minDecibels: -80,
                    maxDecibels: 0,
                    window: 'hann',
                },
                analysisProfileId: 'default',
                channelAliases: null,
            },
        },
        analysisProfiles: { default: analysisProfile },
        defaultAnalysisProfileId: 'default',
        channelAliases: undefined,
    };
}

function createRmsCache(trackId: string): AudioFeatureCache {
    const frameCount = 3;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    const analysisProfile = {
        id: 'default',
        windowSize: 1024,
        hopSize: 512,
        overlap: 2,
        sampleRate: 44100,
        smoothing: null,
        fftSize: null,
        minDecibels: null,
        maxDecibels: null,
        window: null,
    } as const;
    return {
        version: 3,
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
                analysisProfileId: 'default',
                channelAliases: ['L'],
            },
        },
        analysisProfiles: { default: analysisProfile },
        defaultAnalysisProfileId: 'default',
        channelAliases: ['L'],
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
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', createSpectrogramCache('testTrack'));
        const element = new AudioSpectrumElement('spectrum');
        element.updateConfig({
            bandCount: 3,
            sideMode: 'top',
            displayMode: 'bars',
            frequencyScale: 'linear',
            startFrequency: 0,
            endFrequency: 22050,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
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
            frequencyScale: 'linear',
            startFrequency: 0,
            endFrequency: 22050,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
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
            colorMode: 'magnitude',
            colorRampUseMid: false,
            colorRampLowColor: '#111111',
            colorRampHighColor: '#eeeeee',
            frequencyScale: 'linear',
            startFrequency: 0,
            endFrequency: 22050,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const hopSeconds = tm.ticksToSeconds(hopTicks);
        const offsetSeconds = tm.ticksToSeconds(hopTicks * 2);
        const collectHeights = (objects: any[]) => {
            const container = objects[0] as any;
            return (container.children ?? []).slice(1).map((child: any) => child.height ?? 0);
        };
        const collectColors = (objects: any[]) => {
            const container = objects[0] as any;
            return (container.children ?? []).slice(1).map((child: any) => child.fillColor ?? null);
        };
        const before = element.buildRenderObjects({}, offsetSeconds * 0.5);
        const after = element.buildRenderObjects({}, offsetSeconds + (cache.frameCount + 1) * hopSeconds);
        expect(collectHeights(before).every((value: number) => Math.abs(value) <= 1e-6)).toBe(true);
        expect(collectHeights(after).every((value: number) => Math.abs(value) <= 1e-6)).toBe(true);
        expect(collectColors(before).every((color: string | null) => color === '#111111')).toBe(true);
        expect(collectColors(after).every((color: string | null) => color === '#111111')).toBe(true);
    });

    it('applies channel palette colors and stacked layout for layered spectra', () => {
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', createSpectrogramCache('testTrack'));
        const element = new AudioSpectrumElement('spectrumLayers');
        element.updateConfig({
            bandCount: 2,
            layerMode: 'stacked',
            height: 80,
            sideMode: 'top',
            frequencyScale: 'linear',
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    channelAlias: 'Left',
                },
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    channelAlias: 'Right',
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0);
        const container = renderObjects[0] as any;
        const layoutRect = container.children?.[0];
        expect(layoutRect?.height).toBeCloseTo(160);
        const bars = (container.children ?? []).slice(1);
        expect(bars).toHaveLength(4);
        expect(bars[0]?.fillColor).toBe('#38bdf8');
        expect(bars[2]?.fillColor).toBe('#f472b6');
    });

    it('doubles layout height for mirror layer mode', () => {
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', createSpectrogramCache('testTrack'));
        const element = new AudioSpectrumElement('spectrumMirror');
        element.updateConfig({
            bandCount: 2,
            layerMode: 'mirror',
            height: 90,
            sideMode: 'both',
            frequencyScale: 'linear',
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    channelAlias: 'Left',
                },
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                    channelAlias: 'Right',
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0);
        const container = renderObjects[0] as any;
        const layoutRect = container.children?.[0];
        expect(layoutRect?.height).toBeCloseTo(180);
    });

    it('draws history layers when enabled', () => {
        const cache = createSpectrogramCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioSpectrumElement('spectrumHistory');
        element.updateConfig({
            bandCount: 3,
            sideMode: 'top',
            displayMode: 'bars',
            frequencyScale: 'linear',
            historyFrameCount: 2,
            historyOpacity: 0.8,
            historyFade: 1,
            historySoftness: 0,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'spectrogram',
                    calculatorId: 'test.spectrogram',
                    smoothing: 0,
                },
            ],
            analysisProfileId: 'default',
        });
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const targetSeconds = tm.ticksToSeconds(hopTicks * 2);
        const renderObjects = element.buildRenderObjects({}, targetSeconds);
        const container = renderObjects[0] as any;
        expect(container.children).toHaveLength(10);
    });

    it('builds volume meter rectangles', () => {
        const element = new AudioVolumeMeterElement('meter');
        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
    });

    it('updates volume meter height from audio feature frames', () => {
        const cache = createRmsCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioVolumeMeterElement('meterDynamic');
        element.updateConfig({
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'rms',
                    calculatorId: 'test.rms',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const tm = getSharedTimingManager();
        const hopTicks = cache.hopTicks ?? 0;
        const hopSeconds = tm.ticksToSeconds(hopTicks);
        const first = element.buildRenderObjects({}, 0);
        const second = element.buildRenderObjects({}, hopSeconds);
        const getMeterHeight = (objects: any[]) => {
            const container = objects[0] as any;
            const rectangles = (container.children ?? []).filter(
                (child: any) => child instanceof Rectangle && child.includeInLayoutBounds === false,
            );
            const meter = rectangles[rectangles.length - 1];
            return meter?.height ?? 0;
        };
        const firstHeight = getMeterHeight(first);
        const secondHeight = getMeterHeight(second);
        expect(firstHeight).toBeGreaterThan(0);
        expect(secondHeight).toBeGreaterThan(firstHeight);
    });

    it('renders volume text when enabled', () => {
        const element = new AudioVolumeMeterElement('meterText');
        element.updateConfig({ labelMode: 'decibels', textLocation: 'bottom' });

        const renderObjects = element.buildRenderObjects({}, 0);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        const text = (container.children ?? []).find((child: any) => child instanceof Text);
        expect(text).toBeInstanceOf(Text);
        expect(text?.text).toContain('dB');
        const layoutRect = container.children?.[0];
        expect(text?.y ?? 0).toBeGreaterThan((layoutRect?.height ?? 0) - 1);
    });

    it('moves track text with meter height', () => {
        const cache = createRmsCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioVolumeMeterElement('meterTrackText');
        element.updateConfig({
            labelMode: 'decibels',
            textLocation: 'track',
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'rms',
                    calculatorId: 'test.rms',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });

        const first = element.buildRenderObjects({}, 0);
        const firstContainer = first[0] as any;
        const firstText = (firstContainer.children ?? []).find((child: any) => child instanceof Text);
        expect(firstText).toBeInstanceOf(Text);

        const tm = getSharedTimingManager();
        const hopSeconds = tm.ticksToSeconds(cache.hopTicks ?? 0);
        const second = element.buildRenderObjects({}, hopSeconds);
        const secondContainer = second[0] as any;
        const secondText = (secondContainer.children ?? []).find((child: any) => child instanceof Text);
        expect(secondText).toBeInstanceOf(Text);
        expect((secondText?.y as number) < (firstText?.y as number)).toBe(true);
    });

    it('supports horizontal orientation', () => {
        const cache = createRmsCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioVolumeMeterElement('meterHorizontal');
        element.updateConfig({
            orientation: 'horizontal',
            width: 180,
            height: 32,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'rms',
                    calculatorId: 'test.rms',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const tm = getSharedTimingManager();
        const hopSeconds = tm.ticksToSeconds(cache.hopTicks ?? 0);
        const first = element.buildRenderObjects({}, 0);
        const second = element.buildRenderObjects({}, hopSeconds);
        const getMeterWidth = (objects: any[]) => {
            const container = objects[0] as any;
            const rectangles = (container.children ?? []).filter(
                (child: any) => child instanceof Rectangle && child.includeInLayoutBounds === false,
            );
            const meter = rectangles[rectangles.length - 1];
            return meter?.width ?? 0;
        };
        expect(getMeterWidth(second)).toBeGreaterThan(getMeterWidth(first));
    });

    it('renders radial orientation with peak marker', () => {
        const cache = createRmsCache('testTrack');
        useTimelineStore.getState().ingestAudioFeatureCache('testTrack', cache);
        const element = new AudioVolumeMeterElement('meterRadial');
        element.updateConfig({
            orientation: 'radial',
            width: 200,
            height: 200,
            radialThickness: 20,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'rms',
                    calculatorId: 'test.rms',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const tm = getSharedTimingManager();
        const hopSeconds = tm.ticksToSeconds(cache.hopTicks ?? 0);
        const objects = element.buildRenderObjects({}, hopSeconds);
        const container = objects[0] as any;
        const arcs = (container.children ?? []).filter((child: any) => child instanceof Arc);
        expect(arcs.length).toBeGreaterThan(0);
        const lines = (container.children ?? []).filter((child: any) => child instanceof Line);
        expect(lines.some((line: Line) => line.lineWidth > 0)).toBe(true);
    });

    it('samples waveform data for oscilloscope element', () => {
        const element = new AudioOscilloscopeElement('osc');
        element.updateConfig({
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0.25);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect(Array.isArray(container.children)).toBe(true);
        expect(container.children[0]?.includeInLayoutBounds).toBe(true);
        expect(container.children[1]).toBeInstanceOf(Poly);
        expect(container.children[1]?.includeInLayoutBounds).toBe(false);
    });

    it('renders split channel traces with vertical separation', () => {
        const element = new AudioOscilloscopeElement('oscSplit');
        element.updateConfig({
            channelMode: 'split',
            height: 200,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: 0,
                },
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: 1,
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0.5);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        const lines = (container.children ?? []).filter((child: any) => child instanceof Poly) as Poly[];
        expect(lines.length).toBeGreaterThanOrEqual(2);
        const [firstLine, secondLine] = lines;
        expect(firstLine.points.length).toBeGreaterThan(2);
        expect(secondLine.points.length).toBeGreaterThan(2);
        const firstBaselineY = firstLine.points[0]?.y ?? 0;
        const secondBaselineY = secondLine.points[0]?.y ?? 0;
        expect(firstBaselineY).toBeLessThan(secondBaselineY);
        const layoutRect = container.children?.[0];
        const layoutHeight = layoutRect?.height ?? 0;
        expect(firstBaselineY).toBeLessThan(layoutHeight / 2);
        expect(secondBaselineY).toBeGreaterThan(layoutHeight / 2);
    });

    it('aligns trace start when zero-cross triggering is enabled', () => {
        const freeRun = new AudioOscilloscopeElement('oscFree');
        freeRun.updateConfig({
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const zeroCross = new AudioOscilloscopeElement('oscZero');
        zeroCross.updateConfig({
            triggerMode: 'zeroCross',
            triggerThreshold: 0.02,
            triggerDirection: 'rising',
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const freeObjects = freeRun.buildRenderObjects({}, 0.5);
        const zeroObjects = zeroCross.buildRenderObjects({}, 0.5);
        const freeContainer = freeObjects[0] as any;
        const zeroContainer = zeroObjects[0] as any;
        const freeLine = (freeContainer.children ?? []).find((child: any) => child instanceof Poly) as Poly;
        const zeroLine = (zeroContainer.children ?? []).find((child: any) => child instanceof Poly) as Poly;
        expect(freeLine).toBeInstanceOf(Poly);
        expect(zeroLine).toBeInstanceOf(Poly);
        const layoutRect = zeroContainer.children?.[0];
        const baselineY = (layoutRect?.height ?? 0) / 2;
        const freeStart = freeLine.points[0]?.y ?? 0;
        const zeroStart = zeroLine.points[0]?.y ?? 0;
        expect(Math.abs(zeroStart - baselineY)).toBeLessThanOrEqual(Math.abs(freeStart - baselineY));
    });

    it('renders Lissajous mode within viewport bounds', () => {
        const width = 180;
        const height = 180;
        const element = new AudioOscilloscopeElement('oscLissajous');
        element.updateConfig({
            channelMode: 'lissajous',
            width,
            height,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: 0,
                },
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: 1,
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0.5);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        const trace = (container.children ?? []).find((child: any) => child instanceof Poly) as Poly;
        expect(trace).toBeInstanceOf(Poly);
        expect(trace.closed).toBe(false);
        expect(trace.points.length).toBeGreaterThan(2);
        trace.points.forEach((point) => {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(width);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(height);
        });
    });

    it('applies persistence trails with fading opacity', () => {
        const element = new AudioOscilloscopeElement('oscPersistence');
        element.updateConfig({
            persistenceDuration: 1,
            persistenceOpacity: 0.4,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 1);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        const lines = (container.children ?? []).filter((child: any) => child instanceof Poly) as Poly[];
        expect(lines.length).toBeGreaterThanOrEqual(2);
        const alphas = lines.map((poly) => poly.globalAlpha ?? 1);
        expect(alphas.some((alpha) => alpha > 0 && alpha < 1)).toBe(true);
        expect(Math.max(...alphas)).toBeGreaterThanOrEqual(0.99);
    });

    it('aligns the oscilloscope playhead with the window center by default', () => {
        const element = new AudioOscilloscopeElement('oscPlayhead');
        element.updateConfig({
            showPlayhead: true,
            width: 200,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
        const renderObjects = element.buildRenderObjects({}, 0.5);
        expect(renderObjects.length).toBe(1);
        const container = renderObjects[0] as any;
        expect((container.children ?? []).length).toBeGreaterThanOrEqual(3);
        const playhead = (container.children ?? []).find((child: any) => {
            if (!(child instanceof Poly)) return false;
            const pointCount = child.points?.length ?? 0;
            return pointCount === 2;
        }) as Poly | undefined;
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
        const element = new AudioOscilloscopeElement('oscTiming');
        const width = 400;
        const height = 160;
        const tm = getSharedTimingManager();
        const hopTicks = waveformTrack.hopTicks ?? cache.hopTicks ?? 1;
        const windowSeconds = tm.ticksToSeconds(hopTicks * 10);
        element.updateConfig({
            windowSeconds,
            width,
            height,
            featureTrackId: 'testTrack',
            features: [
                {
                    featureKey: 'waveform',
                    calculatorId: 'mvmnt.waveform',
                    smoothing: 0,
                    bandIndex: null,
                    channelIndex: null,
                },
            ],
            analysisProfileId: 'default',
        });
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
