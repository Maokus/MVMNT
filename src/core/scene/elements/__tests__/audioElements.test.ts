import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-displays/audio-volume-meter';
import { AudioPeaksElement, AudioWaveformElement, AudioLockedOscilloscopeElement } from '@core/scene/elements';
import { Line, Poly, Rectangle } from '@core/render/render-objects';
import * as timelineStore from '@state/timelineStore';
import * as analysisIntents from '@audio/features/analysisIntents';
import * as builtInDefinition from '@core/scene/plugins/built-in-definition';

function makeCapabilityContext(
    overrides: {
        sampleFeatureAtTime?: (args: unknown) => unknown;
        sampleFeatureRange?: (args: unknown) => unknown[];
        getRawSamples?: (args: unknown) => Float32Array | null;
        getRmsInWindow?: (args: unknown) => Float32Array | null;
        getSampleRate?: (args: unknown) => number | null;
        secondsToTicks?: (s: number) => number | null;
        secondsToBeats?: (s: number) => number | null;
        beatsToSeconds?: (beats: number) => number | null;
        getStateSnapshot?: () => unknown;
    } = {}
) {
    const ok = <T>(value: T) => ({ ok: true as const, value });
    const unavailable = () => ({
        ok: false as const,
        error: { code: 'RESOURCE_UNAVAILABLE' as const, message: 'Unavailable' },
    });
    const toFeatureFrame = (entry: any, timeSeconds: number) => ({
        timeSeconds,
        value: entry?.values ?? 0,
        channelValues: entry?.metadata?.frame?.channelValues,
        sampleRate: entry?.metadata?.frame?.sampleRate,
    });
    return {
        audio: {
            sampleFeature: (args: any) => {
                const entry = overrides.sampleFeatureAtTime?.({ ...args, time: args.timeSeconds });
                return entry == null ? unavailable() : ok(toFeatureFrame(entry, args.timeSeconds));
            },
            sampleFeatureRange: (args: any) => {
                const legacyArgs = { ...args, startTime: args.startSeconds, endTime: args.endSeconds, stepSec: args.stepSeconds };
                const entries = overrides.sampleFeatureRange?.(legacyArgs) ?? [];
                return ok(entries.map((entry: any, index: number) => {
                    const result = entry && typeof entry === 'object' && 'result' in entry ? entry.result : entry;
                    return toFeatureFrame(result, args.startSeconds + index * args.stepSeconds);
                }));
            },
            getRawSamples: (args: unknown) => {
                const value = overrides.getRawSamples?.(args);
                return value == null ? unavailable() : ok(value);
            },
            getRms: (args: unknown) => {
                const value = overrides.getRmsInWindow?.(args);
                return value == null ? unavailable() : ok(value);
            },
            getChannelMetadata: () => ok({
                sampleRate: overrides.getSampleRate?.({}) ?? 44100,
                channelCount: 2,
                durationSeconds: 60,
                channelLabels: ['left', 'right'],
            }),
            requireFeatures: () => ok({ dispose() {} }),
        },
        timing: {
            secondsToTicks: (value: number) => ok(overrides.secondsToTicks?.(value) ?? 0),
            ticksToSeconds: (value: number) => ok(value / 480),
            secondsToBeats: (value: number) => ok(overrides.secondsToBeats?.(value) ?? 0),
            beatsToSeconds: (value: number) => ok(overrides.beatsToSeconds?.(value) ?? 0),
            beatsToTicks: (value: number) => ok(value * 480),
            ticksToBeats: (value: number) => ok(value / 480),
            getTimeSignature: () => ok({ numerator: 4, denominator: 4 }),
        },
        timeline: {
            getMetadata: () => ok({ durationSeconds: 60, playbackStartSeconds: 0, playbackEndSeconds: 60, tempoBpm: 120, timeSignature: { numerator: 4, denominator: 4 } }),
        },
        assets: {},
        diagnostics: { report() {} },
        signal: new AbortController().signal,
    } as any;
}

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
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext')
            .mockReturnValueOnce(makeCapabilityContext({ getRmsInWindow: () => new Float32Array([0.25]) }))
            .mockReturnValueOnce(makeCapabilityContext({ getRmsInWindow: () => new Float32Array([0.75]) }));

        const element = new AudioVolumeMeterElement('meter', {
            audioTrackId: 'track-1',
            width: 40,
            height: 200,
            minDb: -60,
            maxDb: 0,
            channelMode: 'left',
            showValue: false,
        });

        const [first] = element.buildRenderObjects({}, 1);
        const firstRects = (first as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        // rectangles[0] = background, rectangles[1] = fill bar
        const firstFill = firstRects[1];
        // rms=0.25 → -12.04 dBFS → normalized ≈ 0.799 → fillH ≈ 159.9
        expect(firstFill.height).toBeCloseTo(160, 0);

        const [second] = element.buildRenderObjects({}, 1.5);
        const secondRects = (second as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        const secondFill = secondRects[1];
        expect(secondFill.height).toBeGreaterThan(firstFill.height);
    });

    it('respects channel mode for the volume meter', () => {
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({
                getRmsInWindow: () => new Float32Array([0.1, 0.9]),
            })
        );

        const element = new AudioVolumeMeterElement('meter', {
            audioTrackId: 'track-1',
            width: 20,
            height: 100,
            minDb: -60,
            maxDb: 0,
            showValue: false,
            channelMode: 'right',
        });

        const [container] = element.buildRenderObjects({}, 0);
        const rectangles = (container as any).children.filter(
            (child: unknown) => child instanceof Rectangle
        ) as Rectangle[];
        // rectangles[0] = background, rectangles[1] = fill bar
        const fill = rectangles[1];
        // right channel rms=0.9 → -0.915 dBFS → normalized ≈ 0.985 → fillH ≈ 98.5
        expect(fill.height).toBeCloseTo(98.5, 0);
    });

    it('builds a waveform polyline from sampled range data', () => {
        const waveformSamples = [-1, -0.5, 0.5, 1].map((v) => ({
            values: [v],
            metadata: {
                channels: 1,
                frame: { channels: 1, channelValues: [[v]], format: 'float32' as const },
            },
        }));

        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({
                secondsToTicks: (s: number) => s * 480,
                sampleFeatureRange: () => waveformSamples,
            })
        );

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

    it('samples peak envelopes from discrete analysis windows', () => {
        const peakSamples = [
            { min: -0.8, max: 0.4 },
            { min: -0.2, max: 0.9 },
        ].map(({ min, max }) => ({
            values: [min, max],
            metadata: {
                channels: 1,
                frame: { channels: 1, channelValues: [[min, max]], format: 'waveform-minmax' as const },
            },
        }));
        const sampleFeatureRange = vi.fn((args: any) => {
            const count = Math.round((args.endTime - args.startTime) / args.stepSec) + 1;
            return Array.from({ length: count }, (_, index) => peakSamples[index % peakSamples.length]);
        });
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({ sampleFeatureRange })
        );

        const element = new AudioPeaksElement('peaks', {
            audioTrackId: 'track-1',
            width: 120,
            height: 60,
            windowSeconds: 0.05,
        });

        const [container] = element.buildRenderObjects({}, 2);

        expect((container as any).children.some((child: unknown) => child instanceof Poly)).toBe(true);
        expect(sampleFeatureRange).toHaveBeenCalledWith(
            expect.objectContaining({
                trackId: 'track-1',
                feature: 'peaks',
                startSeconds: expect.any(Number),
                endSeconds: expect.any(Number),
                stepSeconds: expect.any(Number),
            })
        );

        element.buildRenderObjects({}, 2.001);
        expect(sampleFeatureRange).toHaveBeenCalledTimes(2);
        const [initialRequest] = sampleFeatureRange.mock.calls[0] as [any];
        const [nextRequest] = sampleFeatureRange.mock.calls[1] as [any];
        expect(nextRequest.startTime).toBeGreaterThan(initialRequest.endTime);
    });

    it('reduces neighboring peak windows to one min/max envelope bucket', () => {
        const sampleFeatureRange = vi.fn((args: any) => {
            const count = Math.round((args.endTime - args.startTime) / args.stepSec) + 1;
            return Array.from({ length: count }, (_, index) => {
                const isHigh = index % 2 === 1;
                return {
                    values: [isHigh ? -0.9 : -0.2, isHigh ? 0.8 : 0.1],
                    metadata: {
                        channels: 1,
                        frame: {
                            channels: 1,
                            channelValues: [[isHigh ? -0.9 : -0.2, isHigh ? 0.8 : 0.1]],
                            format: 'waveform-minmax' as const,
                        },
                    },
                };
            });
        });
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(makeCapabilityContext({ sampleFeatureRange }));

        const element = new AudioPeaksElement('peaks', {
            audioTrackId: 'track-1',
            width: 120,
            height: 60,
            windowSeconds: 1,
            startOffset: 0,
            secondaryChannel: 'left',
        });
        const [container] = element.buildRenderObjects({}, 0);
        const envelope = (container as any).children.find((child: unknown) => child instanceof Poly) as Poly;

        expect(envelope.points.some((point) => point.y === 6)).toBe(true);
        expect(envelope.points.some((point) => point.y === 57)).toBe(true);
    });

    it('keeps the pre-audio portion silent instead of repeating the first peak frame', () => {
        const sampleFeatureRange = vi.fn((args: any) => {
            const count = Math.round((args.endTime - args.startTime) / args.stepSec) + 1;
            return Array.from({ length: count }, () => ({
                values: [-1, 1],
                metadata: { channels: 1, frame: { channels: 1, channelValues: [[-1, 1]], format: 'waveform-minmax' as const } },
            }));
        });
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(makeCapabilityContext({ sampleFeatureRange }));

        const element = new AudioPeaksElement('peaks', {
            audioTrackId: 'track-1',
            width: 120,
            height: 60,
            windowSeconds: 1,
            startOffset: 0.5,
            secondaryChannel: 'left',
        });
        const [container] = element.buildRenderObjects({}, 0);
        const envelope = (container as any).children.find((child: unknown) => child instanceof Poly) as Poly;

        expect(envelope.points.filter((point) => point.x < 60).every((point) => point.y === 30)).toBe(true);
        expect(sampleFeatureRange.mock.calls.every(([args]) => args.startTime >= 0)).toBe(true);
    });

    it('draws one guide at each beat when beat and bar lines are both enabled', () => {
        const sampleFeatureRange = vi.fn((args: any) => {
            const count = Math.round((args.endTime - args.startTime) / args.stepSec) + 1;
            return Array.from({ length: count }, () => ({
                values: [0, 0],
                metadata: { channels: 1, frame: { channels: 1, channelValues: [[0, 0]], format: 'waveform-minmax' as const } },
            }));
        });
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({
                sampleFeatureRange,
                secondsToBeats: (seconds) => seconds,
                beatsToSeconds: (beats) => beats,
                getStateSnapshot: () => ({ timeline: { beatsPerBar: 4 } }),
            })
        );

        const element = new AudioPeaksElement('peaks', {
            audioTrackId: 'track-1',
            width: 400,
            height: 60,
            windowSeconds: 4,
            startOffset: 0,
            showBeatLines: true,
            showBarLines: true,
            barLineColor: '#ff0000',
            barLineLength: 60,
            beatLineColor: '#00ff00',
            beatLineLength: 20,
        });
        const [container] = element.buildRenderObjects({}, 0);
        const guides = (container as any).children.filter((child: unknown) => child instanceof Line) as Line[];

        expect(guides.map((line) => line.x)).toEqual([0, 100, 200, 300, 400]);
        expect(guides[0]).toMatchObject({ color: '#FF000073', y: 0, deltaY: 60 });
        expect(guides[1]).toMatchObject({ color: '#00FF0073', y: 20, deltaY: 20 });
    });

    it('renders a locked oscilloscope polyline using detected period length', () => {
        // Provide pitch guide data so the element uses the pitch-locked rendering path
        const sineAtPeriod45 = new Float32Array(200);
        for (let i = 0; i < 200; i++) sineAtPeriod45[i] = Math.sin((2 * Math.PI * i) / 45);

        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({
                // Return a pitch guide frame: [f0=440, confidence=0.9, _, anchorSec=2.5, candidateF0=0]
                sampleFeatureAtTime: () => ({
                    values: [440],
                    metadata: { frame: { channelValues: [[440], [0.9], [0], [2.5], [0]] } },
                }),
                getRawSamples: () => sineAtPeriod45,
            })
        );

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
        expect((waveform as Poly).strokeColor).toBe('#FF00FFFF');
    });

    it('applies gain to the locked oscilloscope waveform', () => {
        vi.spyOn(builtInDefinition, 'getEnginePrivateContext').mockReturnValue(
            makeCapabilityContext({
                sampleFeatureAtTime: () => null,
                getRawSamples: () => new Float32Array([0, 0.25, 0, -0.25]),
            })
        );

        const element = new AudioLockedOscilloscopeElement('locked', {
            audioTrackId: 'track-1',
            width: 4,
            height: 40,
            gain: 2,
        });

        const [container] = element.buildRenderObjects({}, 2.5);
        const waveform = (container as any).children.find((child: unknown) => child instanceof Poly) as Poly;

        // 0.25 × gain 2 = 0.5, so the second point is 10px above the 20px center line.
        expect(waveform.points[1]?.y).toBeCloseTo(10);
    });

});
