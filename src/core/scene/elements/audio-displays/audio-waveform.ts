import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Arc, Poly, Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { applyOpacity } from '@utils/color';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { BLEND_MODE_CHOICES, propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

/** Maximum number of display steps to request from the feature pipeline. */
const MAX_SAMPLE_COUNT = 8192;
const MIN_SAMPLE_COUNT = 256;

const DEFAULT_PRIMARY_LINE_COLOR = '#22D3EE';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

type WaveformSide = 'both' | 'sideA' | 'sideB';
type WaveformDisplayMode = 'line' | 'bar' | 'dot';

const DEFAULT_WAVEFORM_SIDE: WaveformSide = 'both';
const DEFAULT_DISPLAY_MODE: WaveformDisplayMode = 'line';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
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
    if (values.length === targetCount) return [...values];
    if (values.length < targetCount) return upsampleLinear(values, targetCount);
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
    if (side === 'both') return [...values];
    const sign = side === 'sideA' ? 1 : -1;
    return values.map((value) => sign * Math.abs(value ?? 0));
}

function normalizeWaveformSide(value: unknown, fallback: WaveformSide = DEFAULT_WAVEFORM_SIDE): WaveformSide {
    if (value === 'both' || value === 'sideA' || value === 'sideB') return value;
    return fallback;
}

function normalizeWaveformDisplay(
    value: unknown,
    fallback: WaveformDisplayMode = DEFAULT_DISPLAY_MODE
): WaveformDisplayMode {
    if (value === 'line' || value === 'bar' || value === 'dot') return value;
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
        result[i] = count > 0 ? total / count : (values[i] ?? 0);
    }
    return result;
}

function computeTaperedWindowSize(baseWindowSize: number, position: number): number {
    if (baseWindowSize <= 1) return 1;
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
    if (!Number.isFinite(gain) || gain === 1) return [...values];
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
    if (!values || values.length < 2) return undefined;
    const normalizedDensity = clamp(Number.isFinite(density) ? density : 1, 0.1, 1);
    const basePointCount = Math.max(2, Math.round(width));
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
    const strokeWidth = Math.max(0, options.lineWidth);
    const linePoints = points.length === 1 ? [...points, { ...points[0], x: points[0].x + 0.001 }] : points;
    const poly = new Poly(linePoints, null, options.color, strokeWidth, { includeInLayoutBounds: false });
    poly.setClosed(false).setLineJoin('round').setLineCap('round');
    options.objects.push(poly);
}

function renderWaveformBars(points: { x: number; y: number }[], options: RenderWaveformSeriesOptions) {
    const centerY = options.height / 2;
    const strokeWidth = Math.max(0, options.lineWidth);
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
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Waveform',
                description: 'Raw PCM oscilloscope view of an audio track.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'waveform',
                        label: 'Oscilloscope',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 800, { step: 1 }),
                            prop.number('height', 'Height (px)', 300, { step: 1 }),
                            {
                                key: 'sampleCount',
                                type: 'number',
                                label: 'Sample Count',
                                default: 4096,
                                step: 256,
                                min: MIN_SAMPLE_COUNT,
                                max: MAX_SAMPLE_COUNT - 1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        if (numeric === undefined) return undefined;
                                        return Math.max(MIN_SAMPLE_COUNT, Math.min(MAX_SAMPLE_COUNT, Math.round(numeric)));
                                    },
                                    defaultValue: 4096,
                                },
                            },
                            {
                                key: 'windowSeconds',
                                type: 'number',
                                label: 'Window (s)',
                                default: 0.5,
                                min: 0.01,
                                max: 30,
                                step: 0.01,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0.01, 30);
                                    },
                                    defaultValue: 0.5,
                                },
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
                                key: 'lineWidth',
                                type: 'number',
                                label: 'Line Width (px)',
                                default: 2,
                                min: 0,
                                step: 0.5,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 10);
                                    },
                                    defaultValue: 2,
                                },
                            },
                            {
                                key: 'gain',
                                type: 'number',
                                label: 'Gain',
                                default: 1,
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
                                key: 'startOffset',
                                type: 'number',
                                label: 'Start Offset',
                                default: 0.5,
                                step: 0.01,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 1);
                                    },
                                    defaultValue: 0.5,
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
                                        return Math.round(clamp(numeric, 0, 64));
                                    },
                                    defaultValue: 0,
                                },
                            },
                            prop.boolean('showPlayhead', 'Show Playhead', false),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'colors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.color('color', 'Color', DEFAULT_PRIMARY_LINE_COLOR),
                            prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.select(
                                'primaryBlendMode',
                                'Blend Mode',
                                'source-over',
                                BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                                { description: 'Canvas composite blending operation.' }
                            ),
                        ],
                    },
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            {
                                key: 'backgroundColor',
                                type: 'color',
                                label: 'Background Color',
                                default: DEFAULT_BACKGROUND_COLOR,
                                runtime: { transform: asTrimmedString, defaultValue: DEFAULT_BACKGROUND_COLOR },
                            },
                            {
                                key: 'backgroundOpacity',
                                type: 'range',
                                label: 'Background Opacity',
                                default: 0,
                                min: 0,
                                max: 1,
                                step: 0.01,
                                runtime: { transform: asNumber, defaultValue: 0 },
                            },
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = props.width ?? 800;
        const height = props.height ?? 300;
        const dampRadius = Math.max(0, Math.round(props.damp ?? 0));
        const side = normalizeWaveformSide(props.side, DEFAULT_WAVEFORM_SIDE);
        const displayMode = normalizeWaveformDisplay(props.display, DEFAULT_DISPLAY_MODE);
        const lineWidth = Math.max(0, props.lineWidth ?? 2);
        const primaryColor = applyOpacity(props.color ?? DEFAULT_PRIMARY_LINE_COLOR, props.opacity ?? 1);
        const gain = clamp(typeof props.gain === 'number' ? props.gain : 1, 0, 10);
        const density = clamp(typeof props.density === 'number' ? props.density : 1, 0.1, 1);
        const startOffset = clamp(typeof props.startOffset === 'number' ? props.startOffset : 0.5, 0, 1);
        const showPlayhead = props.showPlayhead === true;
        const primaryBlendMode = (props.primaryBlendMode ?? 'source-over') as GlobalCompositeOperation;

        const sampleCount = Math.max(
            MIN_SAMPLE_COUNT,
            Math.min(MAX_SAMPLE_COUNT, Math.round(typeof props.sampleCount === 'number' ? props.sampleCount : 4096))
        );
        const windowSeconds = clamp(typeof props.windowSeconds === 'number' ? props.windowSeconds : 0.5, 0.01, 30);

        const objects: RenderObject[] = [];
        objects.push(
            new Rectangle(
                0,
                0,
                width,
                height,
                applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 0)
            )
        );

        const pushFlatLine = () => {
            const centerY = height / 2;
            const line = new Poly(
                [{ x: 0, y: centerY }, { x: width, y: centerY }],
                null,
                primaryColor,
                Math.max(1, lineWidth),
                { includeInLayoutBounds: false }
            );
            line.setClosed(false).setLineJoin('round').setLineCap('round');
            objects.push(line);
            return objects;
        };

        if (!props.audioTrackId) {
            return pushFlatLine();
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioFeaturesRead]);

        if (!host.ok) {
            return pushFlatLine();
        }

        const startSeconds = targetTime - windowSeconds * startOffset;
        const endSeconds = startSeconds + windowSeconds;
        const stepSec = windowSeconds / sampleCount;

        const frames = host.api.audio.sampleFeatureRange({
            element: this,
            trackId: props.audioTrackId,
            feature: 'waveform',
            startTime: startSeconds,
            endTime: endSeconds,
            stepSec,
        });

        if (!frames.length) {
            return pushFlatLine();
        }

        const rawValues = frames.map((f) => f.values?.[0] ?? 0);
        const preparedValues = prepareValuesForDisplay(rawValues, width, dampRadius, side, density, gain);

        if (!preparedValues || preparedValues.length < 2) {
            return pushFlatLine();
        }

        const primaryStart = objects.length;
        renderWaveformSeries(preparedValues, {
            mode: displayMode,
            width,
            height,
            color: primaryColor,
            lineWidth,
            objects,
        });
        if (primaryBlendMode !== 'source-over') {
            for (let i = primaryStart; i < objects.length; i++) {
                objects[i].blendMode = primaryBlendMode;
            }
        }

        if (showPlayhead) {
            const playheadX = startOffset * width;
            const playheadLine = new Poly(
                [
                    { x: playheadX, y: 0 },
                    { x: playheadX, y: height },
                ],
                null,
                primaryColor,
                Math.max(1, lineWidth),
                { includeInLayoutBounds: false }
            );
            playheadLine.setClosed(false).setLineJoin('round').setLineCap('round');
            objects.push(playheadLine);
        }

        return objects;
    }
}
