import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioVolumeMeterElement } from '@core/scene/elements/audio-displays/audio-volume-meter';
import { AudioWaveformElement, AudioLockedOscilloscopeElement } from '@core/scene/elements';
import { AudioDebugElement } from '@core/scene/elements/audio-debug/audio-debug';
import { Poly, Rectangle, Text } from '@core/render/render-objects';
import * as timelineStore from '@state/timelineStore';
import * as analysisIntents from '@audio/features/analysisIntents';
import * as sceneApi from '@audio/features/sceneApi';
import * as pluginSdk from '@mvmnt/plugin-sdk';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';

function makePluginApiResult(
    overrides: {
        sampleFeatureAtTime?: (args: unknown) => unknown;
        sampleFeatureRange?: (args: unknown) => unknown[];
        getRawSamples?: (args: unknown) => Float32Array | null;
        getRmsInWindow?: (args: unknown) => Float32Array | null;
        getSampleRate?: (args: unknown) => number | null;
        secondsToTicks?: (s: number) => number | null;
    } = {}
) {
    return {
        ok: true as const,
        api: {
            audio: {
                sampleFeatureAtTime: overrides.sampleFeatureAtTime ?? (() => null),
                sampleFeatureRange: overrides.sampleFeatureRange ?? (() => []),
                getRawSamples: overrides.getRawSamples ?? (() => null),
                getRmsInWindow: overrides.getRmsInWindow ?? (() => null),
                getSampleRate: overrides.getSampleRate ?? (() => null),
            },
            timing: {
                secondsToTicks: overrides.secondsToTicks ?? (() => null),
                ticksToSeconds: () => null,
                secondsToBeats: () => null,
                beatsToSeconds: () => null,
                beatsToTicks: () => 0,
                ticksToBeats: () => 0,
            },
        } as any,
    };
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
        vi.spyOn(pluginSdk, 'getRequiredPluginApi')
            .mockReturnValueOnce(makePluginApiResult({ getRmsInWindow: () => new Float32Array([0.25]) }))
            .mockReturnValueOnce(makePluginApiResult({ getRmsInWindow: () => new Float32Array([0.75]) }));

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
        vi.spyOn(pluginSdk, 'getRequiredPluginApi').mockReturnValue(
            makePluginApiResult({
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

        vi.spyOn(pluginSdk, 'getRequiredPluginApi').mockReturnValue(
            makePluginApiResult({
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

    it('renders a locked oscilloscope polyline using detected period length', () => {
        // Provide pitch guide data so the element uses the pitch-locked rendering path
        const sineAtPeriod45 = new Float32Array(200);
        for (let i = 0; i < 200; i++) sineAtPeriod45[i] = Math.sin((2 * Math.PI * i) / 45);

        vi.spyOn(pluginSdk, 'getRequiredPluginApi').mockReturnValue(
            makePluginApiResult({
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
