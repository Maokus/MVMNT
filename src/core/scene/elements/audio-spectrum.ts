import { SceneElement } from './base';
import { Line, Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureDescriptor, AudioFeatureTrack, AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import {
    coerceFeatureDescriptor,
    resolveFeatureContext,
    resolveTimelineTrackRefValue,
    sampleFeatureFrame,
} from './audioFeatureUtils';

type SpectrumDisplayMode = 'bars' | 'lines' | 'dots' | 'digital';
type SpectrumSideMode = 'top' | 'bottom' | 'both';
type SpectrumColorMode = 'solid' | 'gradient' | 'magnitude';

const DEFAULT_MIN_DECIBELS = -80;
const DEFAULT_MAX_DECIBELS = 0;
const DEFAULT_DESCRIPTOR = { featureKey: 'spectrogram', smoothing: 0 } as const;

function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function parseColorToRgb(color: string | null | undefined): { r: number; g: number; b: number } | null {
    if (!color) return null;
    const value = color.trim();
    if (!value) return null;
    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
    }
    const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1]
            .split(',')
            .map((part) => part.trim())
            .map((part) => Number.parseFloat(part));
        if (parts.length >= 3 && parts.every((component) => Number.isFinite(component))) {
            return { r: clamp(parts[0], 0, 255), g: clamp(parts[1], 0, 255), b: clamp(parts[2], 0, 255) };
        }
    }
    return null;
}

function mixColors(colorA: string, colorB: string, t: number): string {
    const rgbA = parseColorToRgb(colorA) ?? { r: 34, g: 211, b: 238 };
    const rgbB = parseColorToRgb(colorB) ?? rgbA;
    const ratio = clamp(t, 0, 1);
    const r = Math.round(rgbA.r + (rgbB.r - rgbA.r) * ratio);
    const g = Math.round(rgbA.g + (rgbB.g - rgbA.g) * ratio);
    const b = Math.round(rgbA.b + (rgbB.b - rgbA.b) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
}

interface SpectrogramMetadata {
    sampleRate: number;
    fftSize: number;
    minDecibels: number;
    maxDecibels: number;
    binCount: number;
}

export class AudioSpectrumElement extends SceneElement {
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Spectrum',
            description: 'Visualize spectrogram magnitudes with configurable frequency, style, and color.',
            category: 'audio',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'audioSpectrum',
                    label: 'Spectrum Basics',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Bind to an audio feature and tune the look of the spectrum.',
                    properties: [
                        {
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'featureDescriptor',
                            type: 'audioFeatureDescriptor',
                            label: 'Feature Descriptor',
                            default: null,
                            requiredFeatureKey: 'spectrogram',
                            autoFeatureLabel: 'Spectrogram',
                            trackPropertyKey: 'featureTrackId',
                        },
                        {
                            key: 'startFrequency',
                            type: 'number',
                            label: 'Start Frequency (Hz)',
                            default: 20,
                            min: 0,
                            max: 24000,
                            step: 1,
                        },
                        {
                            key: 'endFrequency',
                            type: 'number',
                            label: 'End Frequency (Hz)',
                            default: 20000,
                            min: 100,
                            max: 24000,
                            step: 1,
                        },
                        {
                            key: 'useLogScale',
                            type: 'boolean',
                            label: 'Logarithmic Scale',
                            default: true,
                        },
                        {
                            key: 'bandCount',
                            type: 'number',
                            label: 'Frequency Bands',
                            default: 96,
                            min: 4,
                            max: 512,
                            step: 1,
                        },
                        {
                            key: 'visualGain',
                            type: 'number',
                            label: 'Visual Gain',
                            default: 1,
                            min: 0.1,
                            max: 5,
                            step: 0.1,
                        },
                        {
                            key: 'displayMode',
                            type: 'select',
                            label: 'Display Mode',
                            default: 'bars',
                            options: [
                                { label: 'Bars', value: 'bars' },
                                { label: 'Lines', value: 'lines' },
                                { label: 'Dots', value: 'dots' },
                                { label: 'Digital', value: 'digital' },
                            ],
                        },
                        {
                            key: 'sideMode',
                            type: 'select',
                            label: 'Sides',
                            default: 'both',
                            options: [
                                { label: 'Top', value: 'top' },
                                { label: 'Bottom', value: 'bottom' },
                                { label: 'Both', value: 'both' },
                            ],
                        },
                        {
                            key: 'colorMode',
                            type: 'select',
                            label: 'Colorization',
                            default: 'solid',
                            options: [
                                { label: 'Solid', value: 'solid' },
                                { label: 'Frequency Gradient', value: 'gradient' },
                                { label: 'Magnitude Gradient', value: 'magnitude' },
                            ],
                        },
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Primary Color',
                            default: '#22d3ee',
                        },
                        {
                            key: 'secondaryColor',
                            type: 'color',
                            label: 'Secondary Color',
                            default: '#6366f1',
                        },
                        {
                            key: 'barWidth',
                            type: 'number',
                            label: 'Bar Width (px)',
                            default: 8,
                            min: 1,
                            max: 80,
                            step: 1,
                        },
                        {
                            key: 'barSpacing',
                            type: 'number',
                            label: 'Bar Spacing (px)',
                            default: 2,
                            min: 0,
                            max: 80,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Bar Height (px)',
                            default: 140,
                            min: 10,
                            max: 800,
                            step: 1,
                        },
                    ],
                    presets: [
                        {
                            id: 'neonCity',
                            label: 'Neon City',
                            values: { barColor: '#22d3ee', barWidth: 6, barSpacing: 1, height: 180 },
                        },
                        {
                            id: 'boldBlocks',
                            label: 'Bold Blocks',
                            values: { barColor: '#f97316', barWidth: 14, barSpacing: 4, height: 220 },
                        },
                        {
                            id: 'minimalMeter',
                            label: 'Minimal Meter',
                            values: { barColor: '#cbd5f5', barWidth: 4, barSpacing: 2, height: 100 },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    private _resolveSpectrogramMetadata(
        cache: AudioFeatureCache | undefined,
        featureTrack: AudioFeatureTrack | undefined,
    ): SpectrogramMetadata | null {
        if (!cache || !featureTrack) {
            return null;
        }
        const rawMetadata = featureTrack.metadata ?? {};
        const sampleRate = (() => {
            const metaRate = rawMetadata.sampleRate;
            if (typeof metaRate === 'number' && Number.isFinite(metaRate)) {
                return metaRate;
            }
            const cacheRate = cache?.analysisParams.sampleRate;
            if (typeof cacheRate === 'number' && Number.isFinite(cacheRate)) {
                return cacheRate;
            }
            return 44100;
        })();
        const fftSize = (() => {
            const metaFft = rawMetadata.fftSize;
            if (typeof metaFft === 'number' && Number.isFinite(metaFft) && metaFft > 0) {
                return metaFft;
            }
            const paramFft = cache?.analysisParams.fftSize;
            if (typeof paramFft === 'number' && Number.isFinite(paramFft) && paramFft > 0) {
                return paramFft;
            }
            return Math.max(2, (featureTrack.channels - 1) * 2);
        })();
        const minDecibels = (() => {
            const metaMin = rawMetadata.minDecibels;
            if (typeof metaMin === 'number' && Number.isFinite(metaMin)) {
                return metaMin;
            }
            return DEFAULT_MIN_DECIBELS;
        })();
        const maxDecibels = (() => {
            const metaMax = rawMetadata.maxDecibels;
            if (typeof metaMax === 'number' && Number.isFinite(metaMax)) {
                return metaMax;
            }
            return DEFAULT_MAX_DECIBELS;
        })();
        return {
            sampleRate,
            fftSize,
            minDecibels,
            maxDecibels,
            binCount: Math.max(1, featureTrack.channels || 1),
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const displayMode = (this.getProperty<string>('displayMode') ?? 'bars') as SpectrumDisplayMode;
        const sideMode = (this.getProperty<string>('sideMode') ?? 'both') as SpectrumSideMode;
        const bandCount = Math.max(1, Math.floor(this.getProperty<number>('bandCount') ?? 96));
        const bandWidth = Math.max(1, this.getProperty<number>('barWidth') ?? 6);
        const bandSpacing = Math.max(0, this.getProperty<number>('barSpacing') ?? 2);
        const lineThickness = Math.max(1, this.getProperty<number>('lineThickness') ?? 2);
        const softness = Math.max(0, this.getProperty<number>('softness') ?? 0);
        const height = Math.max(10, this.getProperty<number>('height') ?? 160);
        const visualGain = Math.max(0.01, this.getProperty<number>('visualGain') ?? 1);
        const colorMode = (this.getProperty<string>('colorMode') ?? 'solid') as SpectrumColorMode;
        const primaryColor = this.getProperty<string>('barColor') ?? '#22d3ee';
        const secondaryColor = this.getProperty<string>('secondaryColor') ?? '#6366f1';
        const useLogScale = this.getProperty<boolean>('useLogScale') ?? true;
        const startFrequencyProp = this.getProperty<number>('startFrequency') ?? 20;
        const endFrequencyProp = this.getProperty<number>('endFrequency') ?? 20000;
        let sample: AudioFeatureFrameSample | null = null;
        let metadata: SpectrogramMetadata | null = null;

        const trackRefBinding = this.getBinding('featureTrackId');
        const trackRefValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorValue = this.getProperty<AudioFeatureDescriptor | null>('featureDescriptor');
        const descriptor = coerceFeatureDescriptor(descriptorValue, DEFAULT_DESCRIPTOR);
        const trackId = resolveTimelineTrackRefValue(trackRefBinding, trackRefValue);

        if (trackId && descriptor.featureKey) {
            sample = sampleFeatureFrame(trackId, descriptor, targetTime);
            const context = resolveFeatureContext(trackId, descriptor.featureKey);
            metadata = this._resolveSpectrogramMetadata(context?.cache, context?.featureTrack);
        }

        const resolvedBinCount = (() => {
            const metaBinCount = metadata?.binCount;
            if (typeof metaBinCount === 'number' && Number.isFinite(metaBinCount) && metaBinCount > 0) {
                return Math.max(1, Math.floor(metaBinCount));
            }
            const sampleLength = sample?.values?.length;
            if (typeof sampleLength === 'number' && sampleLength > 0) {
                return sampleLength;
            }
            return Math.max(1, bandCount);
        })();

        const resolvedMetadata: SpectrogramMetadata = {
            sampleRate: metadata?.sampleRate ?? 44100,
            fftSize: metadata?.fftSize ?? Math.max(2, (resolvedBinCount - 1) * 2),
            minDecibels: metadata?.minDecibels ?? DEFAULT_MIN_DECIBELS,
            maxDecibels: metadata?.maxDecibels ?? DEFAULT_MAX_DECIBELS,
            binCount: resolvedBinCount,
        };

        const isOutsideAnalyzedRange =
            !!sample && (sample.fractionalIndex < 0 || sample.fractionalIndex - sample.frameIndex >= 1);

        const rawValues = sample?.values;
        const silentValue = resolvedMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS;
        const values =
            rawValues && rawValues.length > 0 && !isOutsideAnalyzedRange
                ? rawValues
                : new Array(resolvedMetadata.binCount).fill(silentValue);
        const binCount = values.length;
        const totalWidth = Math.max(1, bandCount * bandWidth + Math.max(0, bandCount - 1) * bandSpacing);

        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, totalWidth, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        const minDecibels = resolvedMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS;
        const maxDecibels = resolvedMetadata.maxDecibels ?? DEFAULT_MAX_DECIBELS;
        const dbRange = Math.max(1e-3, maxDecibels - minDecibels);
        const sampleRate = resolvedMetadata.sampleRate || 44100;
        const nyquist = sampleRate / 2;
        const fftSize = resolvedMetadata.fftSize > 0 ? resolvedMetadata.fftSize : Math.max(2, (binCount - 1) * 2);
        let startFrequency = clamp(startFrequencyProp, 0, nyquist);
        let endFrequency = clamp(endFrequencyProp, 0, nyquist);
        if (endFrequency <= startFrequency) {
            endFrequency = clamp(startFrequency + Math.max(10, nyquist * 0.05), 0, nyquist);
            if (endFrequency <= startFrequency) {
                startFrequency = Math.max(0, endFrequency - 10);
            }
        }

        const logMin = Math.log10(Math.max(1, startFrequency || 1));
        const logMax = Math.log10(Math.max(logMin + 1e-6, endFrequency || 1));
        const logSpan = Math.max(1e-6, logMax - logMin);
        const linearSpan = Math.max(1e-6, endFrequency - startFrequency);
        const amplitudeBase = sideMode === 'both' ? height / 2 : height;
        const baseline = sideMode === 'top' ? height : sideMode === 'bottom' ? 0 : height / 2;
        const colorForBand = (indexRatio: number, magnitude: number) => {
            if (colorMode === 'gradient') {
                return mixColors(primaryColor, secondaryColor, indexRatio);
            }
            if (colorMode === 'magnitude') {
                return mixColors(primaryColor, secondaryColor, magnitude);
            }
            return primaryColor;
        };

        const bandData = new Array<{
            index: number;
            left: number;
            centerX: number;
            topY: number;
            bottomY: number;
            topHeight: number;
            bottomHeight: number;
            normalized: number;
            color: string;
        }>(bandCount);

        const bandStep = bandWidth + bandSpacing;
        for (let band = 0; band < bandCount; band += 1) {
            const indexRatio = bandCount <= 1 ? 0 : band / (bandCount - 1);
            const positionRatio = bandCount <= 0 ? 0.5 : (band + 0.5) / bandCount;
            const frequency = useLogScale
                ? Math.pow(10, logMin + logSpan * positionRatio)
                : startFrequency + linearSpan * positionRatio;
            const binPosition = clamp((frequency * fftSize) / sampleRate, 0, resolvedMetadata.binCount - 1);
            const lowerIndex = Math.floor(binPosition);
            const upperIndex = Math.min(resolvedMetadata.binCount - 1, lowerIndex + 1);
            const mix = binPosition - lowerIndex;
            const lowerValue = values[lowerIndex] ?? minDecibels;
            const upperValue = values[upperIndex] ?? lowerValue;
            const interpolatedDb = lowerValue + (upperValue - lowerValue) * mix;
            const normalized = clamp((interpolatedDb - minDecibels) / dbRange, 0, 1);
            const scaled = clamp(normalized * visualGain, 0, 1);
            const amplitudePixels = scaled * amplitudeBase;
            const centerX = band * bandStep + bandWidth / 2;
            const left = centerX - bandWidth / 2;
            const topY = clamp(baseline - amplitudePixels, 0, height);
            const bottomY = clamp(baseline + amplitudePixels, 0, height);
            const topHeight = baseline - topY;
            const bottomHeight = bottomY - baseline;
            const color = colorForBand(indexRatio, scaled);
            bandData[band] = {
                index: band,
                left,
                centerX,
                topY,
                bottomY,
                topHeight,
                bottomHeight,
                normalized: scaled,
                color,
            };
        }

        const pushRectangle = (x: number, y: number, width: number, rectHeight: number, color: string) => {
            if (rectHeight <= 0) return;
            const rect = new Rectangle(x, y, width, rectHeight, color);
            rect.setIncludeInLayoutBounds(false);
            if (softness > 0) {
                rect.setShadow(color, softness, 0, 0);
            }
            objects.push(rect);
        };

        if (displayMode === 'bars') {
            for (const band of bandData) {
                if (!band) continue;
                if (sideMode === 'top' || sideMode === 'both') {
                    pushRectangle(band.left, band.topY, bandWidth, band.topHeight, band.color);
                }
                if (sideMode === 'bottom' || sideMode === 'both') {
                    pushRectangle(band.left, baseline, bandWidth, band.bottomHeight, band.color);
                }
            }
            return objects;
        }

        if (displayMode === 'lines') {
            if (bandData.length < 2) {
                return objects;
            }
            for (let i = 0; i < bandData.length - 1; i += 1) {
                const current = bandData[i];
                const next = bandData[i + 1];
                if (!current || !next) continue;
                const segmentRatio = bandCount <= 1 ? 0 : (i + 0.5) / (bandCount - 1);
                const magnitude = (current.normalized + next.normalized) / 2;
                const color = colorMode === 'solid' ? primaryColor : colorForBand(segmentRatio, magnitude);
                if (sideMode === 'top' || sideMode === 'both') {
                    const line = new Line(current.centerX, current.topY, next.centerX, next.topY, color, lineThickness);
                    line.setIncludeInLayoutBounds(false);
                    line.setLineCap('round');
                    if (softness > 0) {
                        line.setShadow(color, softness, 0, 0);
                    }
                    objects.push(line);
                }
                if (sideMode === 'bottom' || sideMode === 'both') {
                    const line = new Line(
                        current.centerX,
                        baseline + current.bottomHeight,
                        next.centerX,
                        baseline + next.bottomHeight,
                        color,
                        lineThickness
                    );
                    line.setIncludeInLayoutBounds(false);
                    line.setLineCap('round');
                    if (softness > 0) {
                        line.setShadow(color, softness, 0, 0);
                    }
                    objects.push(line);
                }
            }
            return objects;
        }

        if (displayMode === 'dots') {
            const dotSize = lineThickness;
            for (const band of bandData) {
                if (!band) continue;
                const color =
                    colorMode === 'solid'
                        ? primaryColor
                        : colorForBand(band.index / Math.max(1, bandCount - 1), band.normalized);
                if (sideMode === 'top' || sideMode === 'both') {
                    const centerY = band.topHeight > 0 ? band.topY : baseline - dotSize / 2;
                    const dot = new Rectangle(
                        band.centerX - dotSize / 2,
                        clamp(centerY, 0, Math.max(0, height - dotSize)),
                        dotSize,
                        dotSize,
                        color
                    );
                    dot.setIncludeInLayoutBounds(false);
                    dot.setCornerRadius(dotSize / 2);
                    if (softness > 0) {
                        dot.setShadow(color, softness, 0, 0);
                    }
                    objects.push(dot);
                }
                if (sideMode === 'bottom' || sideMode === 'both') {
                    const centerY =
                        band.bottomHeight > 0 ? baseline + band.bottomHeight - dotSize / 2 : baseline - dotSize / 2;
                    const clampedY = clamp(centerY, 0, Math.max(0, height - dotSize));
                    const dot = new Rectangle(band.centerX - dotSize / 2, clampedY, dotSize, dotSize, color);
                    dot.setIncludeInLayoutBounds(false);
                    dot.setCornerRadius(dotSize / 2);
                    if (softness > 0) {
                        dot.setShadow(color, softness, 0, 0);
                    }
                    objects.push(dot);
                }
            }
            return objects;
        }

        // Digital display: draw stepped segments to mimic LED equalizers
        const segmentHeight = Math.max(1, Math.round(lineThickness));
        const segmentGap = Math.max(0, Math.round(segmentHeight * 0.4));
        for (const band of bandData) {
            if (!band) continue;
            const color =
                colorMode === 'solid'
                    ? primaryColor
                    : colorForBand(band.index / Math.max(1, bandCount - 1), band.normalized);
            if (sideMode === 'top' || sideMode === 'both') {
                let remaining = band.topHeight;
                let cursor = baseline;
                while (remaining > 0.5 && cursor > 0) {
                    const drawHeight = Math.min(segmentHeight, remaining, cursor);
                    if (drawHeight <= 0) break;
                    cursor -= drawHeight;
                    pushRectangle(band.left, cursor, bandWidth, drawHeight, color);
                    remaining -= drawHeight;
                    if (remaining <= 0.5) break;
                    const gap = Math.min(segmentGap, remaining);
                    cursor -= gap;
                    remaining -= gap;
                    if (cursor <= 0) break;
                }
            }
            if (sideMode === 'bottom' || sideMode === 'both') {
                let remaining = band.bottomHeight;
                let cursor = baseline;
                while (remaining > 0.5 && cursor < height) {
                    const available = Math.max(0, height - cursor);
                    if (available <= 0) break;
                    const drawHeight = Math.min(segmentHeight, remaining, available);
                    if (drawHeight <= 0) break;
                    pushRectangle(band.left, cursor, bandWidth, drawHeight, color);
                    remaining -= drawHeight;
                    cursor += drawHeight;
                    if (remaining <= 0.5) break;
                    const gap = Math.min(segmentGap, remaining);
                    cursor += gap;
                    remaining -= gap;
                    if (cursor >= height) break;
                }
            }
        }

        return objects;
    }
}
