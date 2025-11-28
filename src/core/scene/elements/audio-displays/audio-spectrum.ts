import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { getFeatureData } from '@audio/features/sceneApi';
import type { FeatureDataResult } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from '../../../../audio/audioElementMetadata';
import { normalizeChannelSelectorInput } from '../../../../audio/audioFeatureUtils';
import { normalizeColorAlphaValue } from '../../../../utils/color';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

const DEFAULT_BAR_COLOR = '#60A5FAFF';
const DEFAULT_BACKGROUND_COLOR = '#0F172A59';
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

const normalizeChannelSelector: PropertyTransform<string | number | null, SceneElementInterface> = (value) =>
    normalizeChannelSelectorInput(value);

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

const normalizeThickness: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) {
        return undefined;
    }
    return clamp(numeric, 0.5, 64);
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

export class AudioSpectrumElement extends SceneElement {
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Spectrum',
            description: 'Compact magnitude bars for inspecting spectral data.',
            category: 'Audio Displays',
            groups: [
                ...basicGroups,
                {
                    id: 'spectrumBasics',
                    label: 'Spectrum',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: {
                                transform: (value, element) => asTrimmedString(value, element) ?? null,
                                defaultValue: null,
                            },
                        },
                        {
                            key: 'channelSelector',
                            type: 'string',
                            label: 'Channel',
                            default: null,
                            runtime: { transform: normalizeChannelSelector, defaultValue: null },
                        },
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
                        {
                            key: 'minDecibels',
                            type: 'number',
                            label: 'Minimum Value',
                            default: -80,
                            min: -80,
                            max: 0,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: -80 },
                        },
                        {
                            key: 'maxDecibels',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 0,
                            min: -80,
                            max: 24,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 420,
                            min: 40,
                            max: 1600,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 420 },
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 180,
                            min: 40,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 180 },
                        },
                        {
                            key: 'barColor',
                            type: 'colorAlpha',
                            label: 'Bar Color',
                            default: DEFAULT_BAR_COLOR,
                            runtime: {
                                transform: (value) => normalizeColorAlphaValue(value, DEFAULT_BAR_COLOR),
                                defaultValue: DEFAULT_BAR_COLOR,
                            },
                        },
                        {
                            key: 'backgroundColor',
                            type: 'colorAlpha',
                            label: 'Background',
                            default: DEFAULT_BACKGROUND_COLOR,
                            runtime: {
                                transform: (value) => normalizeColorAlphaValue(value, DEFAULT_BACKGROUND_COLOR),
                                defaultValue: DEFAULT_BACKGROUND_COLOR,
                            },
                        },
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
                        {
                            key: 'thickness',
                            type: 'number',
                            label: 'Thickness',
                            default: 4,
                            min: 0.5,
                            max: 64,
                            step: 0.5,
                            runtime: { transform: normalizeThickness, defaultValue: 4 },
                        },
                        {
                            key: 'scale',
                            type: 'select',
                            label: 'Frequency Scale',
                            default: 'linear',
                            options: [
                                { label: 'Linear', value: 'linear' },
                                { label: 'Logarithmic', value: 'log' },
                                { label: 'Mel', value: 'mel' },
                            ],
                            runtime: { transform: normalizeSpectrumScale, defaultValue: 'linear' },
                        },
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
                            min: 0,
                            max: 64,
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
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, props.width, props.height, props.backgroundColor));

        const pushMessage = (message: string) => {
            objects.push(new Text(8, props.height / 2, message, '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const sample = getFeatureData(this, props.audioTrackId, 'spectrogram', targetTime, {
            smoothing: props.smoothing,
        });
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

        const normalized = normalizeDecibelBins(scaledBins, props.minDecibels, props.maxDecibels);

        const actualBarWidth = props.width / props.barCount;
        const gap = Math.min(2, actualBarWidth * 0.25);
        normalized.forEach((ratio, index) => {
            const x = index * actualBarWidth + gap * 0.5;
            const barWidth = Math.max(1, actualBarWidth - gap);
            const barHeight = ratio * props.height;
            const y = props.height - barHeight;
            objects.push(new Rectangle(x, y, barWidth, barHeight, props.barColor));
        });

        return objects;
    }
}
