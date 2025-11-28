import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Arc, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { sampleAudioFeatureRange, type AudioFeatureRangeSample } from '@state/selectors/audioFeatureSelectors';
import { resolveDescriptorProfileId } from '../../../../audio/audioFeatureUtils';
import { registerFeatureRequirements } from '../../../../audio/audioElementMetadata';
import { normalizeColorAlphaValue } from '../../../../utils/color';

const { descriptor: WAVEFORM_DESCRIPTOR } = createFeatureDescriptor({ feature: 'waveform' });

const DEFAULT_PRIMARY_LINE_COLOR = '#22D3EEFF';
const DEFAULT_SECONDARY_LINE_COLOR = '#F472B6FF';
const DEFAULT_BACKGROUND_COLOR = '#0F172A59';

type WaveformSide = 'both' | 'sideA' | 'sideB';
type WaveformChannel = 'left' | 'right' | 'mid' | 'side';
type WaveformDisplayMode = 'line' | 'bar' | 'dot';

const DEFAULT_WAVEFORM_SIDE: WaveformSide = 'both';
const DEFAULT_PRIMARY_CHANNEL: WaveformChannel = 'left';
const DEFAULT_SECONDARY_CHANNEL: WaveformChannel = 'right';
const DEFAULT_DISPLAY_MODE: WaveformDisplayMode = 'line';

registerFeatureRequirements('audioWaveform', [{ feature: 'waveform' }]);
registerFeatureRequirements('audioOscilloscope', [{ feature: 'waveform' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function ensurePointCount(width: number, fallback: number, preferLarger: boolean = true): number {
    const desired = Math.max(2, Math.round(width));
    const safeFallback = Math.max(2, Math.round(fallback));
    return preferLarger ? Math.max(desired, safeFallback) : Math.min(desired, safeFallback);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function upsampleLinear(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (!values.length) return Array.from({ length: targetCount }, () => 0);
    if (values.length === 1) return Array.from({ length: targetCount }, () => values[0] ?? 0);
    if (targetCount === values.length) return [...values];
    const result: number[] = new Array(targetCount);
    const sourceMaxIndex = values.length - 1;
    const denom = targetCount - 1;
    for (let i = 0; i < targetCount; i += 1) {
        const position = denom === 0 ? 0 : (i / denom) * sourceMaxIndex;
        const leftIndex = Math.floor(position);
        const frac = position - leftIndex;
        const left = values[leftIndex] ?? values[sourceMaxIndex] ?? 0;
        const right = values[leftIndex + 1] ?? left;
        result[i] = lerp(left, right, frac);
    }
    return result;
}

function downsampleAveraged(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (!values.length) return Array.from({ length: targetCount }, () => 0);
    if (targetCount >= values.length) return [...values];
    const result: number[] = new Array(targetCount);
    const bucketSize = values.length / targetCount;
    for (let bucket = 0; bucket < targetCount; bucket += 1) {
        const start = Math.floor(bucket * bucketSize);
        const end = Math.floor((bucket + 1) * bucketSize);
        let total = 0;
        let count = 0;
        for (let i = start; i < end && i < values.length; i += 1) {
            total += values[i] ?? 0;
            count += 1;
        }
        if (count === 0) {
            const clampIndex = Math.min(values.length - 1, Math.max(0, Math.round(bucket * bucketSize)));
            result[bucket] = values[clampIndex] ?? 0;
        } else {
            result[bucket] = total / count;
        }
    }
    return result;
}

function normalizeForDisplay(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (values.length <= 1) {
        const fill = values[0] ?? 0;
        return Array.from({ length: targetCount }, () => fill);
    }
    if (values.length === targetCount) {
        return [...values];
    }
    if (values.length < targetCount) {
        return upsampleLinear(values, targetCount);
    }
    return downsampleAveraged(values, targetCount);
}

function buildPolylinePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
    if (!values.length) return [];
    const verticalScale = height / 2;
    const normalizedWidth = Math.max(0, width);
    const denom = Math.max(1, values.length - 1);
    return values.map((value, index) => {
        const x = denom === 0 ? normalizedWidth / 2 : (index / denom) * normalizedWidth;
        const y = height / 2 - value * verticalScale;
        return { x, y };
    });
}

function applySideSelection(values: number[], side: WaveformSide): number[] {
    if (side === 'both') {
        return [...values];
    }
    const sign = side === 'sideA' ? 1 : -1;
    return values.map((value) => sign * Math.abs(value ?? 0));
}

function normalizeWaveformSide(value: unknown, fallback: WaveformSide = DEFAULT_WAVEFORM_SIDE): WaveformSide {
    if (typeof value === 'string') {
        if (value === 'both' || value === 'sideA' || value === 'sideB') {
            return value;
        }
    }
    return fallback;
}

function normalizeWaveformChannel(
    value: unknown,
    fallback: WaveformChannel = DEFAULT_PRIMARY_CHANNEL
): WaveformChannel {
    if (typeof value === 'string') {
        if (value === 'left' || value === 'right' || value === 'mid' || value === 'side') {
            return value;
        }
    }
    return fallback;
}

function normalizeWaveformDisplay(
    value: unknown,
    fallback: WaveformDisplayMode = DEFAULT_DISPLAY_MODE
): WaveformDisplayMode {
    if (typeof value === 'string') {
        if (value === 'line' || value === 'bar' || value === 'dot') {
            return value;
        }
    }
    return fallback;
}

function applyDamp(values: number[], radius: number): number[] {
    if (radius <= 0) return [...values];
    const baseWindowSize = Math.max(1, Math.floor(radius) + 1);
    const result = new Array(values.length);
    const denom = Math.max(1, values.length - 1);
    for (let i = 0; i < values.length; i += 1) {
        const position = denom === 0 ? 0 : i / denom;
        const taperedWindowSize = computeTaperedWindowSize(baseWindowSize, position);
        const dynamicRadius = Math.max(0, Math.round(taperedWindowSize) - 1);
        let total = 0;
        let count = 0;
        const end = Math.min(values.length - 1, i + dynamicRadius);
        for (let j = i; j <= end; j += 1) {
            total += values[j] ?? 0;
            count += 1;
        }
        result[i] = count > 0 ? total / count : values[i] ?? 0;
    }
    return result;
}

function computeTaperedWindowSize(baseWindowSize: number, position: number): number {
    if (baseWindowSize <= 1) {
        return 1;
    }
    const clampedPosition = clamp(Number.isFinite(position) ? position : 0, 0, 1);
    const midWindowSize = Math.max(1, baseWindowSize / 2);
    if (clampedPosition <= 0.5) {
        const t = clampedPosition / 0.5;
        return lerp(baseWindowSize, midWindowSize, t);
    }
    const t = (clampedPosition - 0.5) / 0.5;
    return lerp(midWindowSize, 1, t);
}

function applyGain(values: number[], gain: number): number[] {
    if (!Number.isFinite(gain) || gain === 1) {
        return [...values];
    }
    const safeGain = Math.max(0, gain);
    return values.map((value) => clamp(value * safeGain, -1, 1));
}

function prepareValuesForDisplay(
    values: number[] | undefined,
    width: number,
    dampRadius: number,
    side: WaveformSide,
    density: number,
    gain: number
): number[] | undefined {
    if (!values || values.length < 2) {
        return undefined;
    }
    const normalizedDensity = clamp(Number.isFinite(density) ? density : 1, 0.1, 1);
    const basePointCount = ensurePointCount(width, values.length, true);
    const normalized = normalizeForDisplay(values, basePointCount);
    const shouldDownsample = normalizedDensity < 0.999;
    const densityTarget = shouldDownsample ? Math.max(2, Math.round(width * normalizedDensity)) : basePointCount;
    const densityAdjusted =
        shouldDownsample && densityTarget < normalized.length
            ? normalizeForDisplay(normalized, densityTarget)
            : normalized;
    const averaged = applyDamp(densityAdjusted, dampRadius);
    const amplified = applyGain(averaged, gain);
    return applySideSelection(amplified, side);
}

type ChannelSeriesMap = Partial<Record<WaveformChannel, number[]>>;

interface ChannelPaddingPlan {
    targetLength: number;
    padStart: number;
    padEnd: number;
}

function buildChannelPaddingPlan(
    range: AudioFeatureRangeSample,
    series: ChannelSeriesMap,
    requestedStartTick: number,
    requestedEndTick: number
): ChannelPaddingPlan {
    const seriesLengths = Object.values(series).map((values) => values?.length ?? 0);
    const baseLength = Math.max(range.frameCount || 0, ...seriesLengths, 0);
    const hopTicks = typeof range.hopTicks === 'number' && range.hopTicks > 0 ? range.hopTicks : 0;
    if (!hopTicks || !Number.isFinite(hopTicks)) {
        return {
            targetLength: Math.max(2, baseLength || 0),
            padStart: 0,
            padEnd: 0,
        };
    }
    const trackStartTick = Number.isFinite(range.trackStartTick) ? range.trackStartTick : requestedStartTick;
    const trackEndTick = Number.isFinite(range.trackEndTick) ? range.trackEndTick : requestedEndTick;
    const missingBeforeTicks = Math.max(0, trackStartTick - requestedStartTick);
    const missingAfterTicks = Math.max(0, requestedEndTick - trackEndTick);
    const padStart = Math.max(0, Math.ceil(missingBeforeTicks / hopTicks));
    const padEnd = Math.max(0, Math.ceil(missingAfterTicks / hopTicks));
    const targetLength = Math.max(2, baseLength + padStart + padEnd);
    return {
        targetLength,
        padStart,
        padEnd,
    };
}

function padChannelSeries(series: ChannelSeriesMap, plan: ChannelPaddingPlan): ChannelSeriesMap {
    const safeTarget = Math.max(2, Math.floor(plan.targetLength));
    const padStart = Math.max(0, Math.floor(plan.padStart));
    const padEnd = Math.max(0, Math.floor(plan.padEnd));
    let mutated = false;
    const padded: ChannelSeriesMap = {};
    (Object.entries(series) as [WaveformChannel, number[]][]).forEach(([key, values]) => {
        if (!values) {
            return;
        }
        const needsPadding = padStart > 0 || padEnd > 0 || values.length < safeTarget;
        if (!needsPadding) {
            padded[key] = values;
            return;
        }
        mutated = true;
        const desiredLength = Math.max(safeTarget, padStart + values.length + padEnd);
        const extended = new Array<number>(desiredLength);
        let writeIndex = 0;
        for (; writeIndex < padStart && writeIndex < desiredLength; writeIndex += 1) {
            extended[writeIndex] = 0;
        }
        const copyCount = Math.min(values.length, desiredLength - writeIndex);
        for (let i = 0; i < copyCount; i += 1) {
            extended[writeIndex++] = values[i] ?? 0;
        }
        while (writeIndex < desiredLength) {
            extended[writeIndex++] = 0;
        }
        padded[key] = extended;
    });
    return mutated ? { ...series, ...padded } : series;
}

function extractBaseChannelValues(range: AudioFeatureRangeSample): number[][] {
    const channelStride = Math.max(1, Math.floor(range.channels ?? 0) || 1);
    if (!range.data?.length || range.frameCount < 1) {
        return [];
    }
    if (range.format === 'waveform-minmax') {
        const waveformChannels = Math.max(1, Math.floor(channelStride / 2) || 1);
        const channelValues = Array.from({ length: waveformChannels }, () => [] as number[]);
        for (let frame = 0; frame < range.frameCount; frame += 1) {
            const baseIndex = frame * Math.max(1, channelStride);
            for (let channel = 0; channel < waveformChannels; channel += 1) {
                const pairIndex = baseIndex + channel * 2;
                const min = range.data[pairIndex] ?? 0;
                const max = range.data[pairIndex + 1] ?? min;
                channelValues[channel].push(clamp((min + max) / 2, -1, 1));
            }
        }
        return channelValues;
    }
    const channelValues = Array.from({ length: channelStride }, () => [] as number[]);
    for (let frame = 0; frame < range.frameCount; frame += 1) {
        const baseIndex = frame * channelStride;
        for (let channel = 0; channel < channelStride; channel += 1) {
            channelValues[channel].push(clamp(range.data[baseIndex + channel] ?? 0, -1, 1));
        }
    }
    return channelValues;
}

function extractWaveformChannels(range: AudioFeatureRangeSample): ChannelSeriesMap {
    const baseChannels = extractBaseChannelValues(range);
    const map: ChannelSeriesMap = {};
    const left = baseChannels[0];
    const right = baseChannels[1];
    if (left) {
        map.left = left;
    }
    if (right) {
        map.right = right;
    }
    if (map.left && map.right && map.left.length === map.right.length) {
        map.mid = map.left.map((value, index) => clamp((value + (map.right?.[index] ?? value)) / 2, -1, 1));
        map.side = map.left.map((value, index) => clamp((value - (map.right?.[index] ?? value)) / 2, -1, 1));
    }
    return map;
}

type ChannelSelection = { key: WaveformChannel; values: number[] };

const CHANNEL_FALLBACK_ORDER: WaveformChannel[] = ['left', 'right', 'mid', 'side'];

function resolveChannelSelection(
    series: ChannelSeriesMap,
    selection: WaveformChannel,
    exclude?: Set<WaveformChannel>
): ChannelSelection | null {
    const exact = series[selection];
    if (exact?.length) {
        return { key: selection, values: exact };
    }
    for (const key of CHANNEL_FALLBACK_ORDER) {
        if (exclude?.has(key)) {
            continue;
        }
        const values = series[key];
        if (values?.length) {
            return { key, values };
        }
    }
    return null;
}

interface RenderWaveformSeriesOptions {
    mode: WaveformDisplayMode;
    width: number;
    height: number;
    color: string;
    lineWidth: number;
    objects: RenderObject[];
}

function renderWaveformSeries(values: number[], options: RenderWaveformSeriesOptions): void {
    if (!values.length) return;
    const points = buildPolylinePoints(values, options.width, options.height);
    if (!points.length) return;
    switch (options.mode) {
        case 'bar':
            renderWaveformBars(points, options);
            break;
        case 'dot':
            renderWaveformDots(points, options);
            break;
        case 'line':
        default:
            renderWaveformLine(points, options);
            break;
    }
}

function renderWaveformLine(points: { x: number; y: number }[], options: RenderWaveformSeriesOptions) {
    const strokeWidth = Math.max(0.5, options.lineWidth);
    const linePoints = points.length === 1 ? [...points, { ...points[0], x: points[0].x + 0.001 }] : points;
    const poly = new Poly(linePoints, null, options.color, strokeWidth, { includeInLayoutBounds: false });
    poly.setClosed(false).setLineJoin('round').setLineCap('round');
    options.objects.push(poly);
}

function renderWaveformBars(points: { x: number; y: number }[], options: RenderWaveformSeriesOptions) {
    const centerY = options.height / 2;
    const strokeWidth = Math.max(0.5, options.lineWidth);
    const spacing =
        points.length > 1 ? Math.abs(points[1].x - points[0].x) : options.width / Math.max(1, points.length || 1);
    const barWidth = Math.max(1, Math.min(spacing * 0.8, strokeWidth * 4));
    points.forEach(({ x, y }) => {
        const delta = y - centerY;
        const rectHeight = Math.max(1, Math.abs(delta));
        const rectY = delta < 0 ? y : centerY;
        const rect = new Rectangle(x - barWidth / 2, rectY, barWidth, rectHeight, options.color);
        options.objects.push(rect);
    });
}

function renderWaveformDots(points: { x: number; y: number }[], options: RenderWaveformSeriesOptions) {
    const radius = Math.max(0.5, options.lineWidth / 2);
    points.forEach(({ x, y }) => {
        const dot = new Arc(x, y, radius, 0, Math.PI * 2, false, {
            fillColor: options.color,
            strokeColor: '#FFFFFF00',
        });
        options.objects.push(dot);
    });
}

export class AudioWaveformElement extends SceneElement {
    constructor(id: string = 'audioWaveform', config: Record<string, unknown> = {}) {
        super('audioWaveform', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Waveform',
            description: 'Simple waveform preview for debugging audio features.',
            category: 'Audio Displays',
            groups: [
                ...basicGroups,
                {
                    id: 'oscilloscopeBasics',
                    label: 'Oscilloscope',
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
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Window (seconds)',
                            default: 0.12,
                            min: 0.01,
                            max: 0.5,
                            step: 0.01,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0.01, 1);
                                },
                                defaultValue: 0.12,
                            },
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
                            default: 140,
                            min: 20,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 140 },
                        },
                        {
                            key: 'side',
                            type: 'select',
                            label: 'Side',
                            default: DEFAULT_WAVEFORM_SIDE,
                            options: [
                                { label: 'Both', value: 'both' },
                                { label: 'Side A', value: 'sideA' },
                                { label: 'Side B', value: 'sideB' },
                            ],
                            runtime: {
                                transform: (value) => normalizeWaveformSide(value, DEFAULT_WAVEFORM_SIDE),
                                defaultValue: DEFAULT_WAVEFORM_SIDE,
                            },
                        },
                        {
                            key: 'primaryChannel',
                            type: 'select',
                            label: 'Primary Channel',
                            default: DEFAULT_PRIMARY_CHANNEL,
                            options: [
                                { label: 'Left', value: 'left' },
                                { label: 'Right', value: 'right' },
                                { label: 'Mid (L+R)', value: 'mid' },
                                { label: 'Side (L-R)', value: 'side' },
                            ],
                            runtime: {
                                transform: (value) => normalizeWaveformChannel(value, DEFAULT_PRIMARY_CHANNEL),
                                defaultValue: DEFAULT_PRIMARY_CHANNEL,
                            },
                        },
                        {
                            key: 'secondaryChannel',
                            type: 'select',
                            label: 'Secondary Channel',
                            default: DEFAULT_SECONDARY_CHANNEL,
                            options: [
                                { label: 'Left', value: 'left' },
                                { label: 'Right', value: 'right' },
                                { label: 'Mid (L+R)', value: 'mid' },
                                { label: 'Side (L-R)', value: 'side' },
                            ],
                            runtime: {
                                transform: (value) => normalizeWaveformChannel(value, DEFAULT_SECONDARY_CHANNEL),
                                defaultValue: DEFAULT_SECONDARY_CHANNEL,
                            },
                        },
                        {
                            key: 'primaryColor',
                            type: 'colorAlpha',
                            label: 'Primary Color',
                            default: DEFAULT_PRIMARY_LINE_COLOR,
                            runtime: {
                                transform: (value, element) => {
                                    const legacyColor =
                                        element instanceof AudioWaveformElement
                                            ? element.readLegacyLineColor()
                                            : undefined;
                                    const fallback = legacyColor ?? DEFAULT_PRIMARY_LINE_COLOR;
                                    const candidate = value ?? legacyColor;
                                    return normalizeColorAlphaValue(candidate ?? fallback, fallback);
                                },
                                defaultValue: DEFAULT_PRIMARY_LINE_COLOR,
                            },
                        },
                        {
                            key: 'secondaryColor',
                            type: 'colorAlpha',
                            label: 'Secondary Color',
                            default: DEFAULT_SECONDARY_LINE_COLOR,
                            runtime: {
                                transform: (value, element) => {
                                    const legacyColor =
                                        element instanceof AudioWaveformElement
                                            ? element.readLegacyLineColor()
                                            : undefined;
                                    const fallback = legacyColor ?? DEFAULT_SECONDARY_LINE_COLOR;
                                    const candidate = value ?? legacyColor;
                                    return normalizeColorAlphaValue(candidate ?? fallback, fallback);
                                },
                                defaultValue: DEFAULT_SECONDARY_LINE_COLOR,
                            },
                        },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width (px)',
                            default: 2,
                            min: 1,
                            max: 6,
                            step: 0.5,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0.5, 10);
                                },
                                defaultValue: 2,
                            },
                        },
                        {
                            key: 'gain',
                            type: 'number',
                            label: 'Gain',
                            default: 1,
                            min: 0,
                            max: 10,
                            step: 0.1,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0, 10);
                                },
                                defaultValue: 1,
                            },
                        },
                        {
                            key: 'density',
                            type: 'number',
                            label: 'Density',
                            default: 1,
                            min: 0.1,
                            max: 1,
                            step: 0.05,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0.1, 1);
                                },
                                defaultValue: 1,
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
                            label: 'Display',
                            default: DEFAULT_DISPLAY_MODE,
                            options: [
                                { label: 'Bars', value: 'bar' },
                                { label: 'Line', value: 'line' },
                                { label: 'Dots', value: 'dot' },
                            ],
                            runtime: {
                                transform: (value) => normalizeWaveformDisplay(value, DEFAULT_DISPLAY_MODE),
                                defaultValue: DEFAULT_DISPLAY_MODE,
                            },
                        },
                        {
                            key: 'damp',
                            type: 'number',
                            label: 'Damp',
                            default: 0,
                            min: 0,
                            max: 64,
                            step: 1,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    if (numeric === undefined) return undefined;
                                    const clamped = clamp(numeric, 0, 64);
                                    return Math.round(clamped);
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

    private readLegacyLineColor(): string | undefined {
        if (!this.bindings.has('lineColor')) {
            return undefined;
        }
        try {
            const legacy = this.getProperty<string>('lineColor');
            if (typeof legacy === 'string' && legacy.trim()) {
                return normalizeColorAlphaValue(legacy, DEFAULT_PRIMARY_LINE_COLOR);
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = props.width ?? 420;
        const height = props.height ?? 140;
        const dampRadius = Math.max(0, Math.round(props.damp ?? 0));
        const side = normalizeWaveformSide(props.side, DEFAULT_WAVEFORM_SIDE);
        const displayMode = normalizeWaveformDisplay(props.display, DEFAULT_DISPLAY_MODE);
        const primaryChannel = normalizeWaveformChannel(props.primaryChannel, DEFAULT_PRIMARY_CHANNEL);
        const secondaryChannel = normalizeWaveformChannel(props.secondaryChannel, DEFAULT_SECONDARY_CHANNEL);
        const lineWidth = Math.max(0.5, props.lineWidth ?? 2);
        const primaryColor = props.primaryColor ?? DEFAULT_PRIMARY_LINE_COLOR;
        const secondaryColor = props.secondaryColor ?? DEFAULT_SECONDARY_LINE_COLOR;
        const gain = clamp(typeof props.gain === 'number' ? props.gain : 1, 0, 10);
        const density = clamp(typeof props.density === 'number' ? props.density : 1, 0.1, 1);

        const descriptor = WAVEFORM_DESCRIPTOR;
        const analysisProfileId = resolveDescriptorProfileId(descriptor);

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, width, height, props.backgroundColor));

        const pushMessage = (message: string) => {
            objects.push(new Text(8, height / 2, message, '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const timing = getSharedTimingManager();
        const halfWindow = props.windowSeconds / 2;
        const startSeconds = Math.max(0, targetTime - halfWindow);
        const endSeconds = startSeconds + props.windowSeconds;
        const startTick = Math.floor(timing.secondsToTicks(startSeconds));
        const endTick = Math.max(startTick + 1, Math.ceil(timing.secondsToTicks(endSeconds)));

        const state = useTimelineStore.getState();
        const range = sampleAudioFeatureRange(
            state,
            props.audioTrackId,
            descriptor.featureKey,
            startTick,
            endTick,
            undefined,
            analysisProfileId
        );

        if (!range || !range.data?.length) {
            return pushMessage('No waveform data');
        }

        const baseChannelSeries = extractWaveformChannels(range);
        const paddingPlan = buildChannelPaddingPlan(range, baseChannelSeries, startTick, endTick);
        const channelSeries = padChannelSeries(baseChannelSeries, paddingPlan);
        const primarySelection = resolveChannelSelection(channelSeries, primaryChannel);
        const secondarySelection = resolveChannelSelection(
            channelSeries,
            secondaryChannel,
            primarySelection ? new Set<WaveformChannel>([primarySelection.key]) : undefined
        );

        const preparedPrimary = primarySelection
            ? prepareValuesForDisplay(primarySelection.values, width, dampRadius, side, density, gain)
            : undefined;
        const preparedSecondary = secondarySelection
            ? prepareValuesForDisplay(secondarySelection.values, width, dampRadius, side, density, gain)
            : undefined;

        const hasRenderableSeries = Boolean(
            (preparedPrimary && preparedPrimary.length >= 2) || (preparedSecondary && preparedSecondary.length >= 2)
        );
        if (!hasRenderableSeries) {
            return pushMessage('Waveform too short');
        }

        if (preparedSecondary !== undefined) {
            renderWaveformSeries(preparedSecondary, {
                mode: displayMode,
                width,
                height,
                color: secondaryColor,
                lineWidth,
                objects,
            });
        }

        if (preparedPrimary !== undefined) {
            renderWaveformSeries(preparedPrimary, {
                mode: displayMode,
                width,
                height,
                color: primaryColor,
                lineWidth,
                objects,
            });
        }

        return objects;
    }
}
