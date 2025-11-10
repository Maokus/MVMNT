import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-displays/audio-volume-meter';
import { AudioWaveformElement, AudioLockedOscilloscopeElement } from '@core/scene/elements';
import { AudioDebugElement } from '@core/scene/elements/audio-debug/audio-debug';
import { Poly, Rectangle, Text } from '@core/render/render-objects';
import * as featureUtils from '@audio/audioFeatureUtils';
import * as audioSelectors from '@state/selectors/audioFeatureSelectors';
import * as timelineStore from '@state/timelineStore';
import * as analysisIntents from '@audio/features/analysisIntents';
import * as sceneApi from '@audio/features/sceneApi';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';

describe('simplified audio scene elements', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(analysisIntents, 'publishAnalysisIntent').mockImplementation(() => undefined);
        vi.spyOn(analysisIntents, 'clearAnalysisIntent').mockImplementation(() => undefined);
        vi.spyOn(timelineStore, 'getSharedTimingManager').mockReturnValue({
            secondsToTicks: (seconds: number) => seconds * 480,
            ticksToSeconds: (ticks: number) => ticks / 480,
            ticksPerQuarter: 480,
        } as any);
        vi.spyOn(timelineStore.useTimelineStore, 'getState').mockReturnValue({
            tracks: {
                'track-1': {
                    id: 'track-1',
                    name: 'Track 1',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                },
            },
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        } as any);
    });

    afterEach(() => {
        analysisIntents.resetAnalysisIntentStateForTests();
        vi.restoreAllMocks();
    });

    it('scales the volume meter fill with the sampled RMS value', () => {
        vi.spyOn(featureUtils, 'sampleFeatureFrame')
            .mockReturnValueOnce({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 1,
                format: 'float32' as const,
                channels: 1,
                values: [0.25],
                channelValues: [[0.25]],
            } as any)
            .mockReturnValueOnce({
                frameIndex: 1,
                fractionalIndex: 0,
                hopTicks: 1,
                format: 'float32' as const,
                channels: 1,
                values: [0.75],
                channelValues: [[0.75]],
            } as any);

        const element = new AudioVolumeMeterElement('meter', {
            audioTrackId: 'track-1',
            width: 40,
            height: 200,
            minValue: 0,
            maxValue: 1,
            showValue: false,
        });

        const [first] = element.buildRenderObjects({}, 1);
        const firstRects = (first as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        const firstFill = firstRects[1];
        expect(firstFill.height).toBeCloseTo(50);

        const [second] = element.buildRenderObjects({}, 1.5);
        const secondRects = (second as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        const secondFill = secondRects[1];
        expect(secondFill.height).toBeGreaterThan(firstFill.height);
    });

    it('respects channel selector aliases for the volume meter', () => {
        vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue({
            frameIndex: 0,
            fractionalIndex: 0,
            hopTicks: 1,
            format: 'float32' as const,
            channels: 2,
            values: [0.1, 0.9],
            channelValues: [[0.1], [0.9]],
            channelAliases: ['Left', 'Right'],
        } as any);

        const element = new AudioVolumeMeterElement('meter', {
            audioTrackId: 'track-1',
            width: 20,
            height: 100,
            minValue: 0,
            maxValue: 1,
            showValue: false,
            channelSelector: 'right',
        });

        const [container] = element.buildRenderObjects({}, 0);
        const rectangles = (container as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        const fill = rectangles[1];
        expect(fill.height).toBeCloseTo(90);
    });

    it('builds a waveform polyline from sampled range data', () => {
        vi.spyOn(audioSelectors, 'sampleAudioFeatureRange').mockReturnValue({
            frameCount: 4,
            channels: 1,
            format: 'float32',
            data: new Float32Array([-1, -0.5, 0.5, 1]),
            frameTicks: new Float64Array([0, 1, 2, 3]),
            frameSeconds: new Float64Array([0, 0.01, 0.02, 0.03]),
            hopTicks: 1,
            windowStartTick: 0,
            windowEndTick: 3,
            trackStartTick: 0,
            trackEndTick: 3,
            sourceId: 'track-1',
        } as any);

        const element = new AudioWaveformElement('osc', {
            audioTrackId: 'track-1',
            width: 120,
            height: 60,
            windowSeconds: 0.05,
        });

        const [container] = element.buildRenderObjects({}, 2);
        const waveform = (container as any).children.find((child: unknown) => child instanceof Poly) as
            | Poly
            | undefined;

        expect(waveform).toBeInstanceOf(Poly);
    });

    it('renders a locked oscilloscope polyline using detected period length', () => {
        vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue({
            frameIndex: 4,
            fractionalIndex: 4,
            hopTicks: 1,
            format: 'waveform-periodic' as const,
            values: [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5],
            channelValues: [[0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]],
            frameLength: 6,
        } as any);

        const element = new AudioLockedOscilloscopeElement('locked', {
            audioTrackId: 'track-1',
            width: 100,
            height: 40,
            lineColor: '#ff00ff',
        });

        const [container] = element.buildRenderObjects({}, 2.5);
        const waveform = (container as any).children.find((child: unknown) => child instanceof Poly) as
            | Poly
            | undefined;

        expect(waveform).toBeInstanceOf(Poly);
        expect((waveform as Poly).strokeColor).toBe('#ff00ff');
    });

    it('summarizes channel metadata in the audio debug panel', () => {
        vi.spyOn(audioFeatureCalculatorRegistry, 'list').mockReturnValue([
            {
                id: 'spectrogram-debug',
                featureKey: 'spectrogram',
                label: 'Spectrogram',
                version: 1,
                create: vi.fn(),
            } as any,
        ]);

        vi.spyOn(sceneApi, 'getFeatureData').mockImplementation((_, __, featureKey) => {
            if (featureKey === 'spectrogram') {
                return {
                    values: [0.1, 0.2, 0.3, 0.9],
                    metadata: {
                        descriptor: { featureKey: 'spectrogram' },
                        frame: {
                            channelValues: [
                                [0.1, 0.2, 0.3],
                                [0.9, 0.8, 0.7],
                            ],
                            channelAliases: ['Left', 'Right'],
                            channels: 2,
                            format: 'float32',
                            frameIndex: 0,
                            fractionalIndex: 0,
                            hopTicks: 1,
                        },
                        channels: 2,
                        channelAliases: ['Left', 'Right'],
                        channelLayout: { semantics: 'stereo', aliases: ['Left', 'Right'] },
                    },
                } as any;
            }
            return null;
        });

        const element = new AudioDebugElement('debug', {
            audioTrackId: 'track-1',
            featureKey: 'spectrogram',
            maxValuesToDisplay: 3,
            maxMetadataEntries: 4,
        });

        const [panel] = element.buildRenderObjects({}, 1.25);
        const textNodes = (panel as any).children.filter((child: unknown) => child instanceof Text) as Text[];
        const content = textNodes.map((node) => node.text);

        expect(content.some((line) => line.includes('Channels: 2'))).toBe(true);
        expect(content.some((line) => line.includes('Left (#1)'))).toBe(true);
        expect(content.some((line) => line.includes('Right (#2)'))).toBe(true);
    });
});
