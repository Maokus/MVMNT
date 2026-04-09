import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/elements/audio-displays/audio-spectrum';
import { Rectangle, Text } from '@core/render/render-objects';
import * as pluginSdk from '@mvmnt/plugin-sdk';

function makePluginApiResult(sampleFeatureAtTime: (args: unknown) => unknown) {
    return {
        api: {
            audio: {
                sampleFeatureAtTime,
                sampleFeatureRange: () => [],
            },
            timing: {
                secondsToTicks: () => null,
                ticksToSeconds: () => null,
                secondsToBeats: () => null,
                beatsToSeconds: () => null,
                beatsToTicks: () => 0,
                ticksToBeats: () => 0,
            },
        } as any,
        status: 'ok' as const,
        missingCapabilities: [],
    };
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
        const values = [-80, -60, -40, -20];
        vi.spyOn(pluginSdk, 'getPluginHostApi').mockReturnValue(
            makePluginApiResult(() => ({
                values,
                metadata: {
                    descriptor: { featureKey: 'spectrogram' },
                    frame: {
                        values,
                        channelValues: [values],
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
            }))
        );

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

    it('passes the smoothing value to sampleFeatureAtTime', () => {
        const sampleFeatureAtTimeSpy = vi.fn().mockReturnValue({
            values: new Array(8).fill(-40),
            metadata: {
                descriptor: { featureKey: 'spectrogram' },
                frame: {
                    values: new Array(8).fill(-40),
                    channelValues: [new Array(8).fill(-40)],
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
        });
        vi.spyOn(pluginSdk, 'getPluginHostApi').mockReturnValue(
            makePluginApiResult(sampleFeatureAtTimeSpy)
        );

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

        expect(sampleFeatureAtTimeSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                trackId: 'track-1',
                feature: 'spectrogram',
                time: 2,
                samplingOptions: { smoothing: 12 },
            })
        );
    });

    it('shows a placeholder message when no data is available', () => {
        vi.spyOn(pluginSdk, 'getPluginHostApi').mockReturnValue(
            makePluginApiResult(() => null)
        );

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
