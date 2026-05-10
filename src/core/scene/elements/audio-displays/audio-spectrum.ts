import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Arc, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import type { FeatureDataResult } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { applyOpacity } from '@utils/color';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, BLEND_MODE_CHOICES, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

const DEFAULT_BAR_COLOR = '#60A5FA';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const DEFAULT_MIN_FREQUENCY = 20;
const DEFAULT_MAX_FREQUENCY = 20000;
const MAX_FREQUENCY_LIMIT = 48000;

const SPECTRUM_SCALES = ['linear', 'log', 'mel'] as const;
const SPECTRUM_DISPLAY_MODES = ['bar', 'line', 'dot'] as const;

export type AudioSpectrumScale = (typeof SPECTRUM_SCALES)[number];
export type AudioSpectrumDisplayMode = (typeof SPECTRUM_DISPLAY_MODES)[number];

const spectrumScaleSet = new Set<string>(SPECTRUM_SCALES);
const spectrumDisplaySet = new Set<string>(SPECTRUM_DISPLAY_MODES);

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

const normalizeSpectrumScale: PropertyTransform<AudioSpectrumScale, SceneElementInterface> = (value, element) => {
    const normalized = (asTrimmedString(value, element) ?? '').toLowerCase();
    if (spectrumScaleSet.has(normalized)) {
        return normalized as AudioSpectrumScale;
    }
    return undefined;
};

const normalizeSpectrumDisplay: PropertyTransform<AudioSpectrumDisplayMode, SceneElementInterface> = (
    value,
    element
) => {
    const normalized = (asTrimmedString(value, element) ?? '').toLowerCase();
    if (spectrumDisplaySet.has(normalized)) {
        return normalized as AudioSpectrumDisplayMode;
    }
    return undefined;
};

const normalizeFrequency: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) {
        return undefined;
    }
    return clamp(numeric, 0, MAX_FREQUENCY_LIMIT);
};

export interface SpectrogramBinConversionOptions {
    values: readonly number[];
    sampleRate: number;
    minFrequency: number;
    maxFrequency: number;
    targetBinCount: number;
    scale: AudioSpectrumScale;
}

const MEL_FACTOR = 2595;
const MEL_DIVISOR = 700;
const LOG_MIN_FREQUENCY = 1e-3;

function frequencyToScale(frequency: number, scale: AudioSpectrumScale): number {
    const hz = Math.max(0, frequency);
    if (scale === 'linear') {
        return hz;
    }
    if (scale === 'log') {
        return Math.log10(Math.max(LOG_MIN_FREQUENCY, hz));
    }
    const mel = MEL_FACTOR * Math.log10(1 + hz / MEL_DIVISOR);
    return mel;
}

function scaleToFrequency(value: number, scale: AudioSpectrumScale): number {
    if (scale === 'linear') {
        return Math.max(0, value);
    }
    if (scale === 'log') {
        return Math.pow(10, value);
    }
    return MEL_DIVISOR * (Math.pow(10, value / MEL_FACTOR) - 1);
}

export function convertSpectrogramBins(options: SpectrogramBinConversionOptions): number[] {
    const { values, sampleRate, minFrequency, maxFrequency, targetBinCount, scale } = options;

    const sanitizedTargetBins = Math.max(1, Math.floor(targetBinCount));
    const sanitizedSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
    const nyquist = sanitizedSampleRate / 2;
    const clampedMin = clamp(minFrequency ?? 0, 0, nyquist);
    const clampedMax = clamp(maxFrequency ?? nyquist, clampedMin || 0, nyquist);
    const safeMax = clampedMax <= clampedMin ? Math.min(nyquist, clampedMin + Math.max(1, nyquist * 0.01)) : clampedMax;
    const safeMin = Math.min(clampedMin, safeMax);

    const sourceBins = Math.max(1, values.length);
    const frequencyStep = sourceBins > 1 ? nyquist / (sourceBins - 1) : nyquist;
    const scaleMin = frequencyToScale(scale === 'linear' ? safeMin : Math.max(LOG_MIN_FREQUENCY, safeMin), scale);
    const scaleMax = frequencyToScale(Math.max(safeMin, safeMax), scale);
    const scaleRange = Math.max(1e-9, scaleMax - scaleMin);

    const output: number[] = new Array(sanitizedTargetBins);
    for (let i = 0; i < sanitizedTargetBins; i += 1) {
        const t = (i + 0.5) / sanitizedTargetBins;
        const scaledValue = scaleMin + scaleRange * t;
        const frequency = clamp(scaleToFrequency(scaledValue, scale), safeMin, safeMax);
        const rawIndex = frequencyStep > 0 ? frequency / frequencyStep : 0;
        const clampedIndex = clamp(rawIndex, 0, sourceBins - 1);
        const lowerIndex = Math.floor(clampedIndex);
        const upperIndex = Math.min(sourceBins - 1, lowerIndex + 1);
        const interpolation = clampedIndex - lowerIndex;
        const lowerValue = values[lowerIndex] ?? values[sourceBins - 1] ?? 0;
        const upperValue = values[upperIndex] ?? lowerValue;
        output[i] = lowerValue + (upperValue - lowerValue) * interpolation;
    }

    return output;
}

function resolveSpectrogramSampleRate(result: FeatureDataResult | null): number {
    if (!result) {
        return 44100;
    }

    const descriptor = result.metadata?.descriptor;
    const frameRecord = result.metadata?.frame as { sampleRate?: number } | undefined;
    const candidates: unknown[] = [];

    if (typeof frameRecord?.sampleRate === 'number') {
        candidates.push(frameRecord.sampleRate);
    }

    if (descriptor?.profileOverrides?.sampleRate != null) {
        candidates.push(descriptor.profileOverrides.sampleRate);
    }

    const registry = descriptor?.profileRegistryDelta ?? null;
    const analysisProfileId = descriptor?.analysisProfileId ?? null;
    if (registry && analysisProfileId && registry[analysisProfileId]?.sampleRate != null) {
        candidates.push(registry[analysisProfileId]?.sampleRate);
    }
    if (registry) {
        for (const entry of Object.values(registry)) {
            if (entry?.sampleRate != null) {
                candidates.push(entry.sampleRate);
            }
        }
    }

    for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
            return numeric;
        }
    }

    return 44100;
}

function sanitizeSpectrogramValues(values: number[]): number[] {
    if (!Array.isArray(values) || !values.length) {
        return [];
    }
    return values.map((value) => (Number.isFinite(value) ? value : 0));
}

function normalizeDecibelBins(values: number[], minDecibels: number, maxDecibels: number): number[] {
    const range = Math.max(1e-6, maxDecibels - minDecibels);
    return values.map((value) => clamp((value - minDecibels) / range, 0, 1));
}

function applyTilt(values: number[], tilt: number): number[] {
    const len = values.length;
    return values.map((value, index) => {
        const factor = 1 + tilt * (index / (len - 1) - 0.5) * 2;
        return (value + 80) * factor - 80;
    });
}

function applyGain(values: number[], gain: number): number[] {
    return values.map((value) => (value + 80) * gain - 80);
}

export class AudioSpectrumElement extends SceneElement {
    // Phase 3 reference pattern: intentionally consume audio data through the public plugin API.
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Spectrum',
                description: 'Compact magnitude bars for inspecting spectral data.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'spectrum',
                        label: 'Spectrum',
                        collapsed: false,
                        properties: [
                            {
                                key: 'barCount',
                                type: 'number',
                                label: 'Bars',
                                default: 48,
                                min: 4,
                                max: 256,
                                step: 1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        if (numeric === undefined) return undefined;
                                        return clamp(Math.floor(numeric), 4, 512);
                                    },
                                    defaultValue: 48,
                                },
                            },
                            prop.number('minDecibels', 'Minimum Value', -80, { min: -80, max: 0, step: 1 }),
                            prop.number('maxDecibels', 'Maximum Value', 0, { min: -80, max: 0, step: 1 }),
                            prop.number('width', 'Width (px)', 800, { step: 1 }),
                            prop.number('height', 'Height (px)', 300, { step: 1 }),
                            {
                                key: 'display',
                                type: 'select',
                                label: 'Display Mode',
                                default: 'bar',
                                options: [
                                    { label: 'Bars', value: 'bar' },
                                    { label: 'Line', value: 'line' },
                                    { label: 'Dots', value: 'dot' },
                                ],
                                runtime: { transform: normalizeSpectrumDisplay, defaultValue: 'bar' },
                            },
                            prop.number('thickness', 'Thickness', 4, { step: 0.5 }),
                            {
                                key: 'scale',
                                type: 'select',
                                label: 'Frequency Scale',
                                default: 'mel',
                                options: [
                                    { label: 'Linear', value: 'linear' },
                                    { label: 'Logarithmic', value: 'log' },
                                    { label: 'Mel', value: 'mel' },
                                ],
                                runtime: { transform: normalizeSpectrumScale, defaultValue: 'linear' },
                            },
                            prop.number('tilt', 'Tilt Factor', 0, { step: 0.01 }),
                            prop.number('gain', 'Gain', 1, { step: 0.01 }),
                            {
                                key: 'minFrequency',
                                type: 'number',
                                label: 'Min Frequency (Hz)',
                                default: DEFAULT_MIN_FREQUENCY,
                                min: 0,
                                max: MAX_FREQUENCY_LIMIT,
                                step: 1,
                                runtime: { transform: normalizeFrequency, defaultValue: DEFAULT_MIN_FREQUENCY },
                            },
                            {
                                key: 'maxFrequency',
                                type: 'number',
                                label: 'Max Frequency (Hz)',
                                default: DEFAULT_MAX_FREQUENCY,
                                min: 1,
                                max: MAX_FREQUENCY_LIMIT,
                                step: 1,
                                runtime: { transform: normalizeFrequency, defaultValue: DEFAULT_MAX_FREQUENCY },
                            },
                            {
                                key: 'smoothing',
                                type: 'number',
                                label: 'Smoothing',
                                default: 0,
                                step: 1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 64);
                                    },
                                    defaultValue: 0,
                                },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true }),
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                            prop.range('backgroundOpacity', 'Background Opacity', 0, { min: 0, max: 1, step: 0.01 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const objects: RenderObject[] = [];
        objects.push(
            new Rectangle(
                0,
                0,
                props.width,
                props.height,
                applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 0)
            )
        );

        const pushMessage = (message: string) => {
            objects.push(
                new Text(
                    8,
                    props.height / 2,
                    message,
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                ).setIncludeInLayoutBounds(false)
            );
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
        const sample =
            api && status === 'ok'
                ? api.audio.sampleFeatureAtTime({
                      element: this,
                      trackId: props.audioTrackId,
                      feature: 'spectrogram',
                      time: targetTime,
                      samplingOptions: {
                          smoothing: props.smoothing,
                      },
                  })
                : null;
        const rawValues = sample?.values ?? [];
        if (!rawValues.length) {
            return pushMessage('No spectrum data');
        }

        const sanitizedSource = sanitizeSpectrogramValues(rawValues);
        if (!sanitizedSource.length) {
            return pushMessage('No spectrum data');
        }

        const scaledBins = convertSpectrogramBins({
            values: sanitizedSource,
            sampleRate: resolveSpectrogramSampleRate(sample),
            minFrequency: props.minFrequency,
            maxFrequency: props.maxFrequency,
            targetBinCount: props.barCount,
            scale: props.scale ?? 'linear',
        });

        const transformedBins = applyGain(applyTilt(scaledBins, props.tilt), props.gain);

        const normalized = normalizeDecibelBins(transformedBins, props.minDecibels, props.maxDecibels);
        const actualBarWidth = props.width / props.barCount;
        const gap = Math.min(2, actualBarWidth * 0.25);
        const peakY = (ratio: number) => props.height - ratio * props.height;
        const binLeft = (index: number) => index * actualBarWidth;
        const binCenter = (index: number) => binLeft(index) + actualBarWidth / 2;
        const shapeThickness = Math.max(0.5, props.thickness ?? 1);
        const drawColor = applyOpacity(props.color ?? DEFAULT_BAR_COLOR, props.opacity ?? 1);
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;

        const renderBars = () => {
            const barWidth = Math.max(1, Math.min(actualBarWidth - gap, shapeThickness));
            normalized.forEach((ratio, index) => {
                const x = binLeft(index) + gap * 0.5;
                const barHeight = ratio * props.height;
                const y = peakY(ratio);
                const rect = new Rectangle(x, y, barWidth, barHeight, drawColor);
                if (blendMode !== 'source-over') rect.blendMode = blendMode;
                objects.push(rect);
            });
        };

        const renderLine = () => {
            if (!normalized.length) return;
            const points = normalized.map((ratio, index) => ({ x: binCenter(index), y: peakY(ratio) }));
            if (points.length === 1) {
                points.push({ ...points[0] });
            }
            const poly = new Poly(points, null, drawColor, shapeThickness, { includeInLayoutBounds: false });
            poly.setClosed(false).setLineJoin('round').setLineCap('round');
            poly.blendMode = blendMode === 'source-over' ? null : blendMode;
            objects.push(poly);
        };

        const renderDots = () => {
            const radius = Math.max(0.25, shapeThickness / 2);
            normalized.forEach((ratio, index) => {
                const x = binCenter(index);
                const y = peakY(ratio);
                const arc = new Arc(x, y, radius, 0, Math.PI * 2, false, {
                    fillColor: drawColor,
                    strokeColor: '#FFFFFF00',
                });
                arc.setIncludeInLayoutBounds(false);
                if (blendMode !== 'source-over') arc.blendMode = blendMode;
                objects.push(arc);
            });
        };

        switch (props.display) {
            case 'line':
                renderLine();
                break;
            case 'dot':
                renderDots();
                break;
            case 'bar':
            default:
                renderBars();
                break;
        }

        return objects;
    }
}
