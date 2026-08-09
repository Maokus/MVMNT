import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSpectrumElement } from '@core/scene/built-ins/audio-displays/audio-spectrum';
import { Rectangle, Text } from '@core/render/render-objects';
import * as builtInDefinition from '@core/scene/built-ins/define-built-in';

function makeCapabilityContext(sampleFeature: (args: unknown) => unknown) {
    return {
        audio: {
            sampleFeature: (args: unknown) => {
                const result: any = sampleFeature(args);
                return result == null
                    ? { ok: false as const, error: { code: 'RESOURCE_UNAVAILABLE', message: 'Unavailable' } }
                    : {
                          ok: true as const,
                          value: {
                              timeSeconds: (args as any).timeSeconds,
                              value: result.values,
                              channelValues: result.metadata?.frame?.channelValues,
                              sampleRate: result.metadata?.frame?.sampleRate,
                          },
                      };
            },
            getChannelMetadata: () => ({
                ok: true as const,
                value: { sampleRate: 44100, channelCount: 1, durationSeconds: 60, channelLabels: ['mono'] },
            }),
        },
        assets: {},
        diagnostics: { report() {} },
        signal: new AbortController().signal,
    } as any;
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

    it('renders the configured number of spectrum bars, including the two-bar minimum', () => {
        const values = [-80, -60, -40, -20];
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext(() => ({
                values,
                metadata: {
                    descriptor: { featureKey: 'spectrogram' },
                    frame: {
                        values,
                        channelValues: [values],
                        channels: 1,
                        channelLayout: null,
                        frameIndex: 0,
                        fractionalIndex: 0,
                        hopTicks: 1,
                        format: 'float32',
                    },
                    channels: 1,
                    channelLayout: null,
                },
            }))
        );

        const element = new AudioSpectrumElement('spectrum', {
            audioTrackId: 'track-1',
            barCount: 2,
            width: 200,
            height: 100,
            minDecibels: -80,
            maxDecibels: 0,
        });

        const [container] = element.buildRenderObjects({}, 1);
        const children = (container as any).children as Array<Rectangle | Text>;
        const rectangles = children.filter((child) => child instanceof Rectangle);

        expect(rectangles).toHaveLength(3); // background + 2 bars
        const [background, ...bars] = rectangles;
        expect(background.width).toBeCloseTo(200);
        expect(background.height).toBeCloseTo(100);
        expect(bars).toHaveLength(2);
        expect(bars.every((bar) => bar.height >= 0 && bar.height <= 100)).toBe(true);
    });

    it('samples the SDK 2 spectrogram feature at the render time', () => {
        const sampleFeatureSpy = vi.fn().mockReturnValue({
            values: new Array(8).fill(-40),
            metadata: {
                descriptor: { featureKey: 'spectrogram' },
                frame: {
                    values: new Array(8).fill(-40),
                    channelValues: [new Array(8).fill(-40)],
                    channels: 1,
                    channelLayout: null,
                    frameIndex: 0,
                    fractionalIndex: 0,
                    hopTicks: 1,
                    format: 'float32',
                },
                channels: 1,
                channelLayout: null,
            },
        });
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(makeCapabilityContext(sampleFeatureSpy));

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

        expect(sampleFeatureSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                trackId: 'track-1',
                feature: 'spectrogram',
                timeSeconds: 2,
                smoothing: 12,
            })
        );
    });

    it('shows a placeholder message when no data is available', () => {
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(makeCapabilityContext(() => null));

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
