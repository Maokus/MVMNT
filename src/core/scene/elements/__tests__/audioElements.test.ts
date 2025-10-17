import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-spectrum';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-volume-meter';
import { AudioOscilloscopeElement } from '@core/scene/elements/audio-oscilloscope';
import { Poly, Rectangle, Text } from '@core/render/render-objects';
import * as featureUtils from '@core/scene/elements/audioFeatureUtils';
import * as audioSelectors from '@state/selectors/audioFeatureSelectors';
import * as timelineStore from '@state/timelineStore';
import * as analysisIntents from '@audio/features/analysisIntents';

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

    it('renders the configured number of spectrum bars using sampled data', () => {
        const sampleFrame = {
            frameIndex: 0,
            fractionalIndex: 0,
            hopTicks: 1,
            format: 'float32' as const,
            values: [-80, -60, -40, -20],
        };
        vi.spyOn(featureUtils, 'sampleFeatureFrame').mockReturnValue(sampleFrame as any);

        const element = new AudioSpectrumElement('spectrum', {
            featureTrackId: 'track-1',
            barCount: 4,
            width: 200,
            height: 100,
            minDecibels: -80,
            maxDecibels: 0,
        });

        const [container] = element.buildRenderObjects({}, 1);
        const children = (container as any).children as Array<Rectangle | Text>;
        const rectangles = children.filter((child) => child instanceof Rectangle);

        expect(rectangles).toHaveLength(5); // background + 4 bars
        const [background, ...bars] = rectangles;
        expect(background.width).toBeCloseTo(200);
        expect(background.height).toBeCloseTo(100);
        expect(bars).toHaveLength(4);
        expect(bars.every((bar) => bar.height >= 0 && bar.height <= 100)).toBe(true);
    });

    it('scales the volume meter fill with the sampled RMS value', () => {
        vi.spyOn(featureUtils, 'sampleFeatureFrame')
            .mockReturnValueOnce({
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 1,
                format: 'float32' as const,
                values: [0.25],
            } as any)
            .mockReturnValueOnce({
                frameIndex: 1,
                fractionalIndex: 0,
                hopTicks: 1,
                format: 'float32' as const,
                values: [0.75],
            } as any);

        const element = new AudioVolumeMeterElement('meter', {
            featureTrackId: 'track-1',
            width: 40,
            height: 200,
            minValue: 0,
            maxValue: 1,
            showValue: false,
        });

        const [first] = element.buildRenderObjects({}, 1);
        const firstRects = (first as any).children.filter((child: unknown) => child instanceof Rectangle) as Rectangle[];
        const firstFill = firstRects[1];
        expect(firstFill.height).toBeCloseTo(50);

        const [second] = element.buildRenderObjects({}, 1.5);
        const secondRects = (second as any).children.filter((child: unknown) => child instanceof Rectangle) as Rectangle[];
        const secondFill = secondRects[1];
        expect(secondFill.height).toBeGreaterThan(firstFill.height);
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

        const element = new AudioOscilloscopeElement('osc', {
            featureTrackId: 'track-1',
            width: 120,
            height: 60,
            windowSeconds: 0.05,
        });

        const [container] = element.buildRenderObjects({}, 2);
        const waveform = (container as any).children.find((child: unknown) => child instanceof Poly) as Poly | undefined;

        expect(waveform).toBeInstanceOf(Poly);
        expect((waveform as Poly).points).toHaveLength(4);
    });
});
