import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-displays/audio-spectrum';
import { Rectangle, Text } from '@core/render/render-objects';
import * as sceneApi from '@audio/features/sceneApi';

function createSample(values: number[]) {
    return {
        values,
        metadata: {
            descriptor: { featureKey: 'spectrogram' },
            frame: {
                values,
                channelValues: [values.map((value) => value)],
                channels: 1,
                channelAliases: null,
                channelLayout: null,
                frameIndex: 0,
                fractionalIndex: 0,
                hopTicks: 1,
                format: 'float32',
            },
            channels: 1,
            channelAliases: null,
            channelLayout: null,
        },
    } as const;
}

describe('audio-spectrum element', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            measureText: () => ({ width: 0 }),
            font: '',
        } as unknown as CanvasRenderingContext2D);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the configured number of spectrum bars using sampled data', () => {
        vi.spyOn(sceneApi, 'getFeatureData').mockReturnValue(createSample([-80, -60, -40, -20]) as any);

        const element = new AudioSpectrumElement('spectrum', {
            audioTrackId: 'track-1',
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

    it('passes the smoothing value to getFeatureData', () => {
        const getFeatureSpy = vi
            .spyOn(sceneApi, 'getFeatureData')
            .mockReturnValue(createSample(new Array(8).fill(-40)) as any);

        const element = new AudioSpectrumElement('spectrum', {
            audioTrackId: 'track-1',
            smoothing: 12,
            barCount: 8,
            width: 160,
            height: 100,
            minDecibels: -80,
            maxDecibels: 0,
        });

        element.buildRenderObjects({}, 2);

        expect(getFeatureSpy).toHaveBeenCalledWith(element, 'track-1', 'spectrogram', 2, { smoothing: 12 });
    });

    it('shows a placeholder message when no data is available', () => {
        vi.spyOn(sceneApi, 'getFeatureData').mockReturnValue(undefined as any);

        const element = new AudioSpectrumElement('spectrum', {
            audioTrackId: 'track-1',
            barCount: 4,
            width: 200,
            height: 100,
        });

        const [container] = element.buildRenderObjects({}, 1);
        const text = (container as any).children.find((child: unknown) => child instanceof Text) as Text | undefined;

        expect(text?.text).toMatch(/no spectrum data/i);
    });
});
