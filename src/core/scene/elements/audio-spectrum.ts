import { SceneElement } from './base';
import { Line, Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureDescriptor, AudioFeatureTrack, AudioFeatureCache } from '@audio/features/audioFeatureTypes';
import {
    applyTransferFunction,
    channelColorPalette,
    sampleFeatureHistory,
    type TransferFunctionId,
} from '@utils/audioVisualization';
import {
    coerceFeatureDescriptors,
    emitAnalysisIntent,
    resolveFeatureContext,
    resolveTimelineTrackRefValue,
    sampleFeatureFrame,
} from './audioFeatureUtils';

type SpectrumDisplayMode = 'bars' | 'lines' | 'dots' | 'digital';
type SpectrumSideMode = 'top' | 'bottom' | 'both';
type SpectrumColorMode = 'solid' | 'gradient' | 'magnitude';
type SpectrumLayerMode = 'overlay' | 'stacked' | 'mirror';
type FrequencyScale = 'linear' | 'log' | 'mel' | 'note';

const DEFAULT_MIN_DECIBELS = -80;
const DEFAULT_MAX_DECIBELS = 0;
const DEFAULT_DESCRIPTOR = { featureKey: 'spectrogram', smoothing: 0 } as const;
const NOTE_FREQUENCIES = Array.from({ length: 88 }, (_value, index) => {
    const midi = 21 + index; // A0 (21) through C8 (108)
    return 440 * Math.pow(2, (midi - 69) / 12);
});

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

function hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

function melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

function buildNoteScale(start: number, end: number): number[] {
    const min = Math.max(0, Math.min(start, end));
    const max = Math.max(min, Math.max(start, end));
    const collected = new Set<number>();
    const values: number[] = [];
    const pushValue = (value: number) => {
        const rounded = Number.parseFloat(value.toFixed(6));
        if (!collected.has(rounded)) {
            collected.add(rounded);
            values.push(value);
        }
    };
    pushValue(min);
    for (const noteFrequency of NOTE_FREQUENCIES) {
        if (noteFrequency > min && noteFrequency < max) {
            pushValue(noteFrequency);
        }
    }
    if (max > min) {
        pushValue(max);
    }
    values.sort((a, b) => a - b);
    return values;
}

interface BandDefinition {
    index: number;
    indexRatio: number;
    positionRatio: number;
    frequency: number;
    centerX: number;
    left: number;
}

interface BandGeometry {
    index: number;
    left: number;
    centerX: number;
    topY: number;
    bottomY: number;
    topHeight: number;
    bottomHeight: number;
    normalized: number;
    magnitude: number;
    color: string;
}

interface SpectrumLayerGeometry {
    offsetY: number;
    height: number;
    baseline: number;
    amplitudeBase: number;
    sideMode: SpectrumSideMode;
}

interface RenderDataset {
    bandData: BandGeometry[];
    baseline: number;
    sideMode: SpectrumSideMode;
    displayMode: SpectrumDisplayMode;
    bandWidth: number;
    lineThickness: number;
    softness: number;
    alpha: number;
    minY: number;
    maxY: number;
}

interface ColorRampConfig {
    low: string;
    mid: string | null;
    high: string;
    useMid: boolean;
}

interface TransferConfig {
    id: TransferFunctionId;
    amount: number;
    minDecibels: number;
    maxDecibels: number;
    noiseFloor: number;
}

function computeFrequencyForScale(
    positionRatio: number,
    scale: FrequencyScale,
    start: number,
    end: number,
    noteBins?: number[]
): number {
    const ratio = clamp(positionRatio, 0, 1);
    if (scale === 'log') {
        const safeStart = Math.max(1, start || 1);
        const safeEnd = Math.max(safeStart + 1e-6, end || safeStart + 1);
        const logStart = Math.log10(safeStart);
        const logEnd = Math.log10(safeEnd);
        const value = Math.pow(10, logStart + (logEnd - logStart) * ratio);
        return clamp(value, Math.min(start, end), Math.max(start, end));
    }
    if (scale === 'mel') {
        const melStart = hzToMel(start);
        const melEnd = hzToMel(end);
        const melValue = melStart + (melEnd - melStart) * ratio;
        return clamp(melToHz(melValue), Math.min(start, end), Math.max(start, end));
    }
    if (scale === 'note') {
        const bins = noteBins && noteBins.length >= 2 ? noteBins : buildNoteScale(start, end);
        if (bins.length === 0) {
            return start;
        }
        if (bins.length === 1) {
            return bins[0];
        }
        const position = ratio * (bins.length - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.min(bins.length - 1, lowerIndex + 1);
        const mix = position - lowerIndex;
        const lower = bins[lowerIndex] ?? start;
        const upper = bins[upperIndex] ?? end;
        return lower + (upper - lower) * mix;
    }
    return start + (end - start) * ratio;
}

function buildBandDefinitions(
    bandCount: number,
    bandWidth: number,
    bandSpacing: number,
    scale: FrequencyScale,
    startFrequency: number,
    endFrequency: number
): BandDefinition[] {
    const definitions: BandDefinition[] = [];
    const bandStep = bandWidth + bandSpacing;
    const noteBins = scale === 'note' ? buildNoteScale(startFrequency, endFrequency) : undefined;
    for (let band = 0; band < bandCount; band += 1) {
        const indexRatio = bandCount <= 1 ? 0 : band / (bandCount - 1);
        const positionRatio = bandCount <= 0 ? 0.5 : (band + 0.5) / bandCount;
        const frequency = computeFrequencyForScale(positionRatio, scale, startFrequency, endFrequency, noteBins);
        const centerX = band * bandStep + bandWidth / 2;
        const left = centerX - bandWidth / 2;
        definitions.push({ index: band, indexRatio, positionRatio, frequency, centerX, left });
    }
    return definitions;
}

function colorWithAlpha(color: string, alpha: number): string {
    const rgb = parseColorToRgb(color);
    if (!rgb) {
        return color;
    }
    const normalizedAlpha = clamp(alpha, 0, 1);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha.toFixed(3)})`;
}

function resolveLayerColor(
    descriptor: AudioFeatureDescriptor,
    layerIndex: number,
    palette: ReturnType<typeof channelColorPalette>,
    primaryColor: string,
    secondaryColor: string
): string {
    const alias = descriptor.channelAlias?.trim().toLowerCase() ?? null;
    if (alias) {
        const match = palette.find((entry) => entry.alias?.toLowerCase() === alias);
        if (match) {
            return match.color;
        }
    }
    if (descriptor.channelIndex != null) {
        const indexed = palette[descriptor.channelIndex];
        if (indexed) {
            return indexed.color;
        }
    }
    const fallbackEntry = palette[layerIndex] ?? palette[0];
    if (fallbackEntry) {
        return fallbackEntry.color;
    }
    return layerIndex === 0 ? primaryColor : secondaryColor;
}

function createColorStrategy(
    colorMode: SpectrumColorMode,
    layerColor: string,
    secondaryColor: string,
    ramp: ColorRampConfig | null
): (band: BandDefinition, normalized: number, magnitude: number) => string {
    if (colorMode === 'gradient') {
        return (band) => mixColors(layerColor, secondaryColor, band.indexRatio);
    }
    if (colorMode === 'magnitude' && ramp) {
        return (_band, _normalized, magnitude) => {
            const ratio = clamp(magnitude, 0, 1);
            if (ramp.useMid && ramp.mid) {
                if (ratio <= 0.5) {
                    const mixRatio = ratio <= 0.5 ? ratio / 0.5 : 0;
                    return mixColors(ramp.low, ramp.mid, mixRatio);
                }
                const mixRatio = (ratio - 0.5) / 0.5;
                return mixColors(ramp.mid, ramp.high, mixRatio);
            }
            return mixColors(ramp.low, ramp.high, ratio);
        };
    }
    if (colorMode === 'magnitude') {
        return (_band, _normalized, magnitude) => mixColors(layerColor, secondaryColor, clamp(magnitude, 0, 1));
    }
    return () => layerColor;
}

function computeLayerGeometry(
    layerMode: SpectrumLayerMode,
    sideMode: SpectrumSideMode,
    baseHeight: number,
    totalHeight: number,
    layerIndex: number,
    layerCount: number
): SpectrumLayerGeometry {
    if (layerMode === 'stacked') {
        const offsetY = baseHeight * layerIndex;
        const layerHeight = baseHeight;
        const baseline =
            sideMode === 'top' ? offsetY + layerHeight : sideMode === 'bottom' ? offsetY : offsetY + layerHeight / 2;
        const amplitudeBase = sideMode === 'both' ? layerHeight / 2 : layerHeight;
        return { offsetY, height: layerHeight, baseline, amplitudeBase, sideMode };
    }
    if (layerMode === 'mirror') {
        const halfHeight = totalHeight / Math.max(1, Math.min(2, layerCount));
        const isTop = layerIndex % 2 === 0;
        const mode: SpectrumSideMode = isTop ? 'top' : 'bottom';
        return {
            offsetY: 0,
            height: totalHeight,
            baseline: halfHeight,
            amplitudeBase: halfHeight,
            sideMode: mode,
        };
    }
    const amplitudeBase = sideMode === 'both' ? totalHeight / 2 : totalHeight;
    const baseline = sideMode === 'top' ? totalHeight : sideMode === 'bottom' ? 0 : totalHeight / 2;
    return { offsetY: 0, height: totalHeight, baseline, amplitudeBase, sideMode };
}

function computeBandGeometry(
    bandDefinitions: BandDefinition[],
    values: number[],
    metadata: SpectrogramMetadata,
    geometry: SpectrumLayerGeometry,
    colorStrategy: (band: BandDefinition, normalized: number, magnitude: number) => string,
    transfer: TransferConfig
): BandGeometry[] {
    const results: BandGeometry[] = [];
    const fftSize = metadata.fftSize > 0 ? metadata.fftSize : Math.max(2, (metadata.binCount - 1) * 2);
    const sampleRate = metadata.sampleRate || 44100;
    const minDecibels = metadata.minDecibels ?? DEFAULT_MIN_DECIBELS;
    const maxDecibels = metadata.maxDecibels ?? DEFAULT_MAX_DECIBELS;
    const dbRange = Math.max(1e-3, maxDecibels - minDecibels);
    const binLimit = Math.max(1, values.length);
    const minY = geometry.offsetY;
    const maxY = geometry.offsetY + geometry.height;
    const sanitizedAmount = Math.max(0, transfer.amount);
    const noiseFloor = Math.min(Math.max(transfer.noiseFloor, minDecibels), maxDecibels);

    for (const band of bandDefinitions) {
        const binPosition = clamp((band.frequency * fftSize) / sampleRate, 0, binLimit - 1);
        const lowerIndex = Math.floor(binPosition);
        const upperIndex = Math.min(binLimit - 1, lowerIndex + 1);
        const mix = binPosition - lowerIndex;
        const lowerValue = values[lowerIndex] ?? minDecibels;
        const upperValue = values[upperIndex] ?? lowerValue;
        const interpolatedDb = lowerValue + (upperValue - lowerValue) * mix;
        const normalized = clamp((interpolatedDb - minDecibels) / dbRange, 0, 1);

        let magnitude: number;
        switch (transfer.id) {
            case 'log': {
                const base = applyTransferFunction(normalized, 'log', {
                    base: Math.max(2, 1 + sanitizedAmount * 9),
                });
                magnitude = clamp(base, 0, 1);
                break;
            }
            case 'power': {
                magnitude = applyTransferFunction(normalized, 'power', {
                    exponent: Math.max(0.1, sanitizedAmount || 2),
                });
                break;
            }
            case 'db': {
                magnitude = applyTransferFunction(normalized, 'db', {
                    decibelValue: interpolatedDb,
                    referenceDecibels: maxDecibels,
                    gain: Math.max(0, sanitizedAmount || 1),
                });
                break;
            }
            case 'linear':
            default: {
                const base = applyTransferFunction(normalized, 'linear');
                magnitude = clamp(base * (sanitizedAmount || 1), 0, 1);
                break;
            }
        }

        if (interpolatedDb <= noiseFloor) {
            magnitude = 0;
        }

        const amplitudePixels = magnitude * geometry.amplitudeBase;
        let topHeight = 0;
        let bottomHeight = 0;
        if (geometry.sideMode === 'top' || geometry.sideMode === 'both') {
            topHeight = amplitudePixels;
        }
        if (geometry.sideMode === 'bottom' || geometry.sideMode === 'both') {
            bottomHeight = amplitudePixels;
        }

        const topY = clamp(geometry.baseline - topHeight, minY, maxY);
        const bottomY = clamp(geometry.baseline + bottomHeight, minY, maxY);
        const color = colorStrategy(band, normalized, magnitude);

        results.push({
            index: band.index,
            left: band.left,
            centerX: band.centerX,
            topY,
            bottomY,
            topHeight,
            bottomHeight,
            normalized,
            magnitude,
            color,
        });
    }

    return results;
}

interface SpectrogramMetadata {
    sampleRate: number;
    fftSize: number;
    minDecibels: number;
    maxDecibels: number;
    binCount: number;
    frameCount: number;
    channelAliases: (string | null)[];
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
                            key: 'analysisProfileId',
                            type: 'audioAnalysisProfile',
                            label: 'Analysis Profile',
                            default: 'default',
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
                            key: 'frequencyScale',
                            type: 'select',
                            label: 'Frequency Scale',
                            default: 'log',
                            options: [
                                { label: 'Linear', value: 'linear' },
                                { label: 'Logarithmic', value: 'log' },
                                { label: 'Mel', value: 'mel' },
                                { label: 'Note', value: 'note' },
                            ],
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
                            key: 'layerMode',
                            type: 'select',
                            label: 'Layer Mode',
                            default: 'overlay',
                            options: [
                                { label: 'Overlay', value: 'overlay' },
                                { label: 'Stacked', value: 'stacked' },
                                { label: 'Mirror', value: 'mirror' },
                            ],
                            description: 'Control how multiple descriptors or channels are arranged vertically.',
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
                            key: 'lineThickness',
                            type: 'number',
                            label: 'Line Thickness (px)',
                            default: 2,
                            min: 1,
                            max: 20,
                            step: 1,
                        },
                        {
                            key: 'softness',
                            type: 'number',
                            label: 'Glow Softness (px)',
                            default: 0,
                            min: 0,
                            max: 50,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Layer Height (px)',
                            default: 140,
                            min: 10,
                            max: 800,
                            step: 1,
                            description: 'Base height for each spectrum layer before stacking or mirroring.',
                        },
                        {
                            key: 'transferFunction',
                            type: 'select',
                            label: 'Transfer Function',
                            default: 'linear',
                            options: [
                                { label: 'Linear', value: 'linear' },
                                { label: 'Logarithmic', value: 'log' },
                                { label: 'Power', value: 'power' },
                                { label: 'Decibel', value: 'db' },
                            ],
                        },
                        {
                            key: 'transferAmount',
                            type: 'number',
                            label: 'Transfer Amount',
                            default: 1,
                            min: 0.1,
                            max: 8,
                            step: 0.1,
                            description: 'Adjusts the intensity or exponent of the selected transfer function.',
                        },
                        {
                            key: 'noiseFloor',
                            type: 'number',
                            label: 'Noise Floor (dB)',
                            default: -90,
                            min: -120,
                            max: 0,
                            step: 1,
                            description: 'Magnitudes below this threshold are treated as silent.',
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
                {
                    id: 'audioSpectrumColorRamp',
                    label: 'Magnitude Color Ramp',
                    variant: 'basic',
                    collapsed: true,
                    description: 'Configure the gradient used when colorization is magnitude-driven.',
                    properties: [
                        {
                            key: 'colorRampPreset',
                            type: 'select',
                            label: 'Ramp Preset',
                            default: 'aurora',
                            options: [
                                { label: 'Aurora', value: 'aurora' },
                                { label: 'Sunset', value: 'sunset' },
                                { label: 'Firelight', value: 'firelight' },
                                { label: 'Custom', value: 'custom' },
                            ],
                            visibleWhen: [{ key: 'colorMode', equals: 'magnitude' }],
                        },
                        {
                            key: 'colorRampUseMid',
                            type: 'boolean',
                            label: 'Enable Mid Color',
                            default: true,
                            visibleWhen: [{ key: 'colorMode', equals: 'magnitude' }],
                        },
                        {
                            key: 'colorRampLowColor',
                            type: 'color',
                            label: 'Low Magnitude Color',
                            default: '#0ea5e9',
                            visibleWhen: [{ key: 'colorMode', equals: 'magnitude' }],
                        },
                        {
                            key: 'colorRampMidColor',
                            type: 'color',
                            label: 'Mid Magnitude Color',
                            default: '#a855f7',
                            visibleWhen: [
                                { key: 'colorMode', equals: 'magnitude' },
                                { key: 'colorRampUseMid', truthy: true },
                            ],
                        },
                        {
                            key: 'colorRampHighColor',
                            type: 'color',
                            label: 'High Magnitude Color',
                            default: '#facc15',
                            visibleWhen: [{ key: 'colorMode', equals: 'magnitude' }],
                        },
                    ],
                    presets: [
                        {
                            id: 'aurora',
                            label: 'Aurora',
                            values: {
                                colorRampPreset: 'aurora',
                                colorRampUseMid: true,
                                colorRampLowColor: '#0ea5e9',
                                colorRampMidColor: '#a855f7',
                                colorRampHighColor: '#facc15',
                            },
                        },
                        {
                            id: 'sunsetGlow',
                            label: 'Sunset Glow',
                            values: {
                                colorRampPreset: 'sunset',
                                colorRampUseMid: true,
                                colorRampLowColor: '#f97316',
                                colorRampMidColor: '#facc15',
                                colorRampHighColor: '#f87171',
                            },
                        },
                        {
                            id: 'deepOcean',
                            label: 'Deep Ocean',
                            values: {
                                colorRampPreset: 'custom',
                                colorRampUseMid: true,
                                colorRampLowColor: '#0f172a',
                                colorRampMidColor: '#1d4ed8',
                                colorRampHighColor: '#38bdf8',
                            },
                        },
                    ],
                },
                {
                    id: 'audioSpectrumHistory',
                    label: 'History Glow',
                    variant: 'advanced',
                    collapsed: true,
                    description: 'Blend cached frames to create glow trails without introducing renderer state.',
                    properties: [
                        {
                            key: 'historyFrameCount',
                            type: 'number',
                            label: 'History Frames',
                            default: 0,
                            min: 0,
                            max: 8,
                            step: 1,
                        },
                        {
                            key: 'historyOpacity',
                            type: 'number',
                            label: 'History Opacity',
                            default: 0.35,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            visibleWhen: [{ key: 'historyFrameCount', truthy: true }],
                        },
                        {
                            key: 'historyFade',
                            type: 'number',
                            label: 'History Fade',
                            default: 0.6,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            description: 'Lower values fade older frames more quickly.',
                            visibleWhen: [{ key: 'historyFrameCount', truthy: true }],
                        },
                        {
                            key: 'historySoftness',
                            type: 'number',
                            label: 'History Softness Boost',
                            default: 8,
                            min: 0,
                            max: 50,
                            step: 1,
                            description: 'Additional blur radius applied to history layers.',
                            visibleWhen: [{ key: 'historyFrameCount', truthy: true }],
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    private _resolveSpectrogramMetadata(
        cache: AudioFeatureCache | undefined,
        featureTrack: AudioFeatureTrack | undefined
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
        const channelAliases = (() => {
            const fromTrack = Array.isArray(featureTrack.channelAliases) ? featureTrack.channelAliases : null;
            const fromCache = Array.isArray(cache.channelAliases) ? cache.channelAliases : null;
            const fromMetadata = Array.isArray((rawMetadata as any).channelAliases)
                ? ((rawMetadata as any).channelAliases as unknown[])
                : null;
            const source = fromTrack?.length ? fromTrack : fromCache?.length ? fromCache : fromMetadata ?? [];
            return source.map((alias) => (typeof alias === 'string' && alias.trim() ? alias : null));
        })();
        return {
            sampleRate,
            fftSize,
            minDecibels,
            maxDecibels,
            binCount: Math.max(1, featureTrack.channels || 1),
            frameCount: Math.max(0, featureTrack.frameCount ?? cache?.frameCount ?? 0),
            channelAliases,
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const displayMode = (this.getProperty<string>('displayMode') ?? 'bars') as SpectrumDisplayMode;
        const sideMode = (this.getProperty<string>('sideMode') ?? 'both') as SpectrumSideMode;
        const bandCount = Math.max(1, Math.floor(this.getProperty<number>('bandCount') ?? 96));
        const bandWidth = Math.max(1, this.getProperty<number>('barWidth') ?? 6);
        const bandSpacing = Math.max(0, this.getProperty<number>('barSpacing') ?? 2);
        const lineThickness = Math.max(1, this.getProperty<number>('lineThickness') ?? 2);
        const baseSoftness = Math.max(0, this.getProperty<number>('softness') ?? 0);
        const baseHeight = Math.max(10, this.getProperty<number>('height') ?? 160);
        const transferFunction = (this.getProperty<string>('transferFunction') ?? 'linear') as TransferFunctionId;
        const rawTransferAmount = this.getProperty<number>('transferAmount');
        const transferAmount = Number.isFinite(rawTransferAmount) ? (rawTransferAmount as number) : 1;
        const rawNoiseFloor = this.getProperty<number>('noiseFloor');
        let noiseFloor = Number.isFinite(rawNoiseFloor) ? (rawNoiseFloor as number) : -90;
        const colorMode = (this.getProperty<string>('colorMode') ?? 'solid') as SpectrumColorMode;
        const primaryColor = this.getProperty<string>('barColor') ?? '#22d3ee';
        const secondaryColor = this.getProperty<string>('secondaryColor') ?? '#6366f1';
        const frequencyScale = (this.getProperty<string>('frequencyScale') ?? 'log') as FrequencyScale;
        const layerMode = (this.getProperty<string>('layerMode') ?? 'overlay') as SpectrumLayerMode;
        const startFrequencyProp = this.getProperty<number>('startFrequency') ?? 20;
        const endFrequencyProp = this.getProperty<number>('endFrequency') ?? 20000;
        const historyCount = Math.max(0, Math.floor(this.getProperty<number>('historyFrameCount') ?? 0));
        const historyOpacity = clamp(this.getProperty<number>('historyOpacity') ?? 0.35, 0, 1);
        const historyFade = clamp(this.getProperty<number>('historyFade') ?? 0.6, 0, 1);
        const historySoftness = Math.max(
            0,
            this.getProperty<number>('historySoftness') ?? (baseSoftness > 0 ? baseSoftness : 8)
        );
        const rampUseMid = this.getProperty<boolean>('colorRampUseMid') ?? true;
        const rampConfig: ColorRampConfig | null =
            colorMode === 'magnitude'
                ? {
                      low: this.getProperty<string>('colorRampLowColor') ?? '#0ea5e9',
                      mid: rampUseMid ? this.getProperty<string>('colorRampMidColor') ?? '#a855f7' : null,
                      high: this.getProperty<string>('colorRampHighColor') ?? '#facc15',
                      useMid: rampUseMid,
                  }
                : null;

        const trackRefBinding = this.getBinding('featureTrackId');
        const trackRefValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
        const descriptors = coerceFeatureDescriptors(descriptorsValue, DEFAULT_DESCRIPTOR);
        const trackId = resolveTimelineTrackRefValue(trackRefBinding, trackRefValue);
        const analysisProfileId = this.getProperty<string>('analysisProfileId') ?? null;

        emitAnalysisIntent(this, trackId, analysisProfileId, descriptors);

        const layerContexts = descriptors.map((descriptor) => {
            if (!trackId || !descriptor.featureKey) {
                return { descriptor, sample: null, metadata: null as SpectrogramMetadata | null };
            }
            const sample = sampleFeatureFrame(trackId, descriptor, targetTime);
            const context = resolveFeatureContext(trackId, descriptor.featureKey);
            const metadata = this._resolveSpectrogramMetadata(context?.cache, context?.featureTrack);
            return { descriptor, sample, metadata };
        });

        const metadataList = layerContexts
            .map((layer) => layer.metadata)
            .filter((value): value is SpectrogramMetadata => value != null);
        const primaryMetadata = metadataList[0] ?? null;
        const sampleRate = primaryMetadata?.sampleRate ?? 44100;
        const referenceMinDb = primaryMetadata?.minDecibels ?? DEFAULT_MIN_DECIBELS;
        const referenceMaxDb = primaryMetadata?.maxDecibels ?? DEFAULT_MAX_DECIBELS;
        noiseFloor = clamp(noiseFloor, referenceMinDb, referenceMaxDb);

        const nyquist = sampleRate / 2;
        let startFrequency = clamp(startFrequencyProp, 0, nyquist);
        let endFrequency = clamp(endFrequencyProp, 0, nyquist);
        if (endFrequency <= startFrequency) {
            endFrequency = clamp(startFrequency + Math.max(10, nyquist * 0.05), 0, nyquist);
            if (endFrequency <= startFrequency) {
                startFrequency = Math.max(0, endFrequency - 10);
            }
        }

        const bandDefinitions = buildBandDefinitions(
            bandCount,
            bandWidth,
            bandSpacing,
            frequencyScale,
            startFrequency,
            endFrequency
        );
        const totalWidth = Math.max(1, bandCount * bandWidth + Math.max(0, bandCount - 1) * bandSpacing);
        const layerCount = Math.max(1, descriptors.length);

        let totalHeight = baseHeight;
        if (layerMode === 'stacked') {
            totalHeight = baseHeight * layerCount;
        } else if (layerMode === 'mirror') {
            totalHeight = baseHeight * Math.min(2, layerCount);
        }

        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, totalWidth, totalHeight, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        const aliasCandidates =
            primaryMetadata?.channelAliases?.length && primaryMetadata.channelAliases.length > 0
                ? primaryMetadata.channelAliases
                : descriptors.map((descriptor) => descriptor.channelAlias ?? null);
        const palette = channelColorPalette(aliasCandidates);

        const sanitizedTransferAmount = Math.max(0, transferAmount);
        const historyDatasets: RenderDataset[] = [];
        const currentDatasets: RenderDataset[] = [];

        layerContexts.forEach((layer, layerIndex) => {
            const layerMetadata = layer.metadata ?? primaryMetadata;
            const valuesSource = layer.sample?.values?.length ? layer.sample.values : null;
            const fallbackBinCount = layerMetadata?.binCount ?? valuesSource?.length ?? bandCount;
            const resolvedBinCount = Math.max(1, valuesSource?.length ?? Math.floor(fallbackBinCount));
            const resolvedMetadata: SpectrogramMetadata = {
                sampleRate: layerMetadata?.sampleRate ?? sampleRate,
                fftSize: layerMetadata?.fftSize ?? primaryMetadata?.fftSize ?? Math.max(2, (resolvedBinCount - 1) * 2),
                minDecibels: layerMetadata?.minDecibels ?? referenceMinDb,
                maxDecibels: layerMetadata?.maxDecibels ?? referenceMaxDb,
                binCount: resolvedBinCount,
                frameCount: Math.max(0, layerMetadata?.frameCount ?? primaryMetadata?.frameCount ?? 0),
                channelAliases: layerMetadata?.channelAliases ?? primaryMetadata?.channelAliases ?? [],
            };
            const silentValue = resolvedMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS;
            const fractionalIndex = layer.sample?.fractionalIndex;
            const isOutOfRange =
                fractionalIndex == null ||
                Number.isNaN(fractionalIndex) ||
                !Number.isFinite(fractionalIndex) ||
                fractionalIndex < 0 ||
                (resolvedMetadata.frameCount > 0 && fractionalIndex >= resolvedMetadata.frameCount);
            const values =
                valuesSource && valuesSource.length && !isOutOfRange
                    ? valuesSource
                    : new Array(resolvedBinCount).fill(silentValue);
            const geometry = computeLayerGeometry(layerMode, sideMode, baseHeight, totalHeight, layerIndex, layerCount);
            const layerColor = resolveLayerColor(layer.descriptor, layerIndex, palette, primaryColor, secondaryColor);
            const colorStrategy = createColorStrategy(colorMode, layerColor, secondaryColor, rampConfig);
            const layerNoiseFloor = clamp(
                noiseFloor,
                resolvedMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS,
                resolvedMetadata.maxDecibels ?? DEFAULT_MAX_DECIBELS
            );
            const bandData = computeBandGeometry(bandDefinitions, values, resolvedMetadata, geometry, colorStrategy, {
                id: transferFunction,
                amount: sanitizedTransferAmount,
                minDecibels: resolvedMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS,
                maxDecibels: resolvedMetadata.maxDecibels ?? DEFAULT_MAX_DECIBELS,
                noiseFloor: layerNoiseFloor,
            });
            currentDatasets.push({
                bandData,
                baseline: geometry.baseline,
                sideMode: geometry.sideMode,
                displayMode,
                bandWidth,
                lineThickness,
                softness: baseSoftness,
                alpha: 1,
                minY: geometry.offsetY,
                maxY: geometry.offsetY + geometry.height,
            });

            if (historyCount > 0 && trackId && layer.descriptor.featureKey) {
                const frames = sampleFeatureHistory(
                    trackId,
                    layer.descriptor,
                    targetTime,
                    Math.min(historyCount, 8) + 1
                );
                if (frames.length > 1) {
                    const framesToRender = frames.slice(0, frames.length - 1);
                    for (let i = 0; i < framesToRender.length; i += 1) {
                        const orderIndex = framesToRender.length - 1 - i;
                        const alpha = historyOpacity * Math.pow(historyFade, orderIndex);
                        if (alpha <= 0.001) {
                            continue;
                        }
                        const frame = framesToRender[i];
                        const frameValues = frame.values?.length ? frame.values : values;
                        const historyMetadata: SpectrogramMetadata = {
                            ...resolvedMetadata,
                            binCount: frameValues.length > 0 ? frameValues.length : resolvedMetadata.binCount,
                        };
                        const historyBandData = computeBandGeometry(
                            bandDefinitions,
                            frameValues.length ? frameValues : values,
                            historyMetadata,
                            geometry,
                            colorStrategy,
                            {
                                id: transferFunction,
                                amount: sanitizedTransferAmount,
                                minDecibels: historyMetadata.minDecibels ?? DEFAULT_MIN_DECIBELS,
                                maxDecibels: historyMetadata.maxDecibels ?? DEFAULT_MAX_DECIBELS,
                                noiseFloor: layerNoiseFloor,
                            }
                        );
                        historyDatasets.push({
                            bandData: historyBandData,
                            baseline: geometry.baseline,
                            sideMode: geometry.sideMode,
                            displayMode,
                            bandWidth,
                            lineThickness,
                            softness: baseSoftness + historySoftness * (orderIndex + 1),
                            alpha,
                            minY: geometry.offsetY,
                            maxY: geometry.offsetY + geometry.height,
                        });
                    }
                }
            }
        });

        const datasets = [...historyDatasets, ...currentDatasets];

        for (const dataset of datasets) {
            if (!dataset.bandData.length || dataset.alpha <= 0) {
                continue;
            }
            if (dataset.displayMode === 'bars') {
                for (const band of dataset.bandData) {
                    if (band.topHeight > 0 && (dataset.sideMode === 'top' || dataset.sideMode === 'both')) {
                        const rect = new Rectangle(band.left, band.topY, dataset.bandWidth, band.topHeight, band.color);
                        rect.setIncludeInLayoutBounds(false);
                        if (dataset.softness > 0) {
                            rect.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            rect.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(rect);
                    }
                    if (band.bottomHeight > 0 && (dataset.sideMode === 'bottom' || dataset.sideMode === 'both')) {
                        const rect = new Rectangle(
                            band.left,
                            dataset.baseline,
                            dataset.bandWidth,
                            band.bottomHeight,
                            band.color
                        );
                        rect.setIncludeInLayoutBounds(false);
                        if (dataset.softness > 0) {
                            rect.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            rect.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(rect);
                    }
                }
                continue;
            }

            if (dataset.displayMode === 'lines') {
                if (dataset.bandData.length < 2) {
                    continue;
                }
                for (let i = 0; i < dataset.bandData.length - 1; i += 1) {
                    const current = dataset.bandData[i];
                    const next = dataset.bandData[i + 1];
                    const blendedTop = mixColors(current.color, next.color, 0.5);
                    const lineColorTop = dataset.alpha < 1 ? colorWithAlpha(blendedTop, dataset.alpha) : blendedTop;
                    if (dataset.sideMode === 'top' || dataset.sideMode === 'both') {
                        const line = new Line(
                            current.centerX,
                            current.topY,
                            next.centerX,
                            next.topY,
                            lineColorTop,
                            lineThickness
                        );
                        line.setIncludeInLayoutBounds(false);
                        line.setLineCap('round');
                        if (dataset.softness > 0) {
                            line.setShadow(lineColorTop, dataset.softness, 0, 0);
                        }
                        objects.push(line);
                    }
                    if (dataset.sideMode === 'bottom' || dataset.sideMode === 'both') {
                        const blendedBottom = mixColors(current.color, next.color, 0.5);
                        const lineColorBottom =
                            dataset.alpha < 1 ? colorWithAlpha(blendedBottom, dataset.alpha) : blendedBottom;
                        const line = new Line(
                            current.centerX,
                            Math.min(dataset.maxY, dataset.baseline + current.bottomHeight),
                            next.centerX,
                            Math.min(dataset.maxY, dataset.baseline + next.bottomHeight),
                            lineColorBottom,
                            lineThickness
                        );
                        line.setIncludeInLayoutBounds(false);
                        line.setLineCap('round');
                        if (dataset.softness > 0) {
                            line.setShadow(lineColorBottom, dataset.softness, 0, 0);
                        }
                        objects.push(line);
                    }
                }
                continue;
            }

            if (dataset.displayMode === 'dots') {
                const dotSize = lineThickness;
                for (const band of dataset.bandData) {
                    if (dataset.sideMode === 'top' || dataset.sideMode === 'both') {
                        const centerY = band.topHeight > 0 ? band.topY : dataset.baseline - dotSize / 2;
                        const topY = clamp(centerY, dataset.minY, Math.max(dataset.minY, dataset.maxY - dotSize));
                        const dot = new Rectangle(band.centerX - dotSize / 2, topY, dotSize, dotSize, band.color);
                        dot.setIncludeInLayoutBounds(false);
                        dot.setCornerRadius(dotSize / 2);
                        if (dataset.softness > 0) {
                            dot.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            dot.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(dot);
                    }
                    if (dataset.sideMode === 'bottom' || dataset.sideMode === 'both') {
                        const centerY =
                            band.bottomHeight > 0
                                ? dataset.baseline + band.bottomHeight - dotSize / 2
                                : dataset.baseline - dotSize / 2;
                        const bottomY = clamp(centerY, dataset.minY, Math.max(dataset.minY, dataset.maxY - dotSize));
                        const dot = new Rectangle(band.centerX - dotSize / 2, bottomY, dotSize, dotSize, band.color);
                        dot.setIncludeInLayoutBounds(false);
                        dot.setCornerRadius(dotSize / 2);
                        if (dataset.softness > 0) {
                            dot.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            dot.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(dot);
                    }
                }
                continue;
            }

            const segmentHeight = Math.max(1, Math.round(lineThickness));
            const segmentGap = Math.max(0, Math.round(segmentHeight * 0.4));
            for (const band of dataset.bandData) {
                if (dataset.sideMode === 'top' || dataset.sideMode === 'both') {
                    let remaining = band.topHeight;
                    let cursor = dataset.baseline;
                    while (remaining > 0.5 && cursor > dataset.minY) {
                        const drawHeight = Math.min(segmentHeight, remaining, cursor - dataset.minY);
                        if (drawHeight <= 0) break;
                        cursor -= drawHeight;
                        const rect = new Rectangle(band.left, cursor, dataset.bandWidth, drawHeight, band.color);
                        rect.setIncludeInLayoutBounds(false);
                        if (dataset.softness > 0) {
                            rect.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            rect.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(rect);
                        remaining -= drawHeight;
                        if (remaining <= 0.5) break;
                        const gap = Math.min(segmentGap, remaining);
                        cursor -= gap;
                        remaining -= gap;
                        if (cursor <= dataset.minY) break;
                    }
                }
                if (dataset.sideMode === 'bottom' || dataset.sideMode === 'both') {
                    let remaining = band.bottomHeight;
                    let cursor = dataset.baseline;
                    while (remaining > 0.5 && cursor < dataset.maxY) {
                        const available = Math.max(0, dataset.maxY - cursor);
                        if (available <= 0) break;
                        const drawHeight = Math.min(segmentHeight, remaining, available);
                        if (drawHeight <= 0) break;
                        const rect = new Rectangle(band.left, cursor, dataset.bandWidth, drawHeight, band.color);
                        rect.setIncludeInLayoutBounds(false);
                        if (dataset.softness > 0) {
                            rect.setShadow(band.color, dataset.softness, 0, 0);
                        }
                        if (dataset.alpha < 1) {
                            rect.setGlobalAlpha(dataset.alpha);
                        }
                        objects.push(rect);
                        remaining -= drawHeight;
                        cursor += drawHeight;
                        if (remaining <= 0.5) break;
                        const gap = Math.min(segmentGap, remaining);
                        cursor += gap;
                        remaining -= gap;
                        if (cursor >= dataset.maxY) break;
                    }
                }
            }
        }

        return objects;
    }
}
