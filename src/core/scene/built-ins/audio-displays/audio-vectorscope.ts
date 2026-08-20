import { BoundSceneElement, asNumber, type PropertyTransform } from '@core/scene/runtime/bound-scene-element';
import { ClipLayer, Line, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/scene/runtime/schema';
import { applyOpacity } from '@utils/color';
import { prop, insertElementConfig } from '@core/scene/runtime/schema-builders';
import { propGroup, tab } from '@core/scene/built-ins/schema-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/built-ins/define-built-in';
import { parseFontSelection } from '@fonts/font-loader';

const DEFAULT_TRACE_COLOR = '#FFFFFF';
const DEFAULT_GRID_COLOR = '#64748B';
const DEFAULT_BACKGROUND_COLOR = '#000000';
const ROOT_TWO = Math.sqrt(2);
const RGB_LOW_CUTOFF_HZ = 200;
const RGB_HIGH_CUTOFF_HZ = 2_000;
const RGB_ENVELOPE_SECONDS = 0.015;
const VECTORSCOPE_MODES = [
    'unipolar-scaled',
    'unipolar-unscaled',
    'bipolar-scaled',
    'bipolar-unscaled',
    'lissajous',
] as const;
const VECTORSCOPE_TRACE_MODES = ['lines', 'points'] as const;
const VECTORSCOPE_COLOR_MODES = ['solid', 'rgb-meter'] as const;

export type VectorscopeMode = (typeof VECTORSCOPE_MODES)[number];
export type VectorscopeTraceMode = (typeof VECTORSCOPE_TRACE_MODES)[number];
export type VectorscopeColorMode = (typeof VECTORSCOPE_COLOR_MODES)[number];

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

const boundedNumber =
    (min: number, max: number): PropertyTransform<number, SceneElementInterface> =>
    (value, element) => {
        const numeric = asNumber(value, element);
        return numeric === undefined ? undefined : clamp(numeric, min, max);
    };

export interface VectorscopePoint {
    x: number;
    y: number;
    age: number;
    level: number;
}

function normalizeVectorscopeMode(value: unknown): VectorscopeMode {
    return VECTORSCOPE_MODES.includes(value as VectorscopeMode) ? (value as VectorscopeMode) : 'bipolar-scaled';
}

function normalizeTraceMode(value: unknown): VectorscopeTraceMode {
    return VECTORSCOPE_TRACE_MODES.includes(value as VectorscopeTraceMode) ? (value as VectorscopeTraceMode) : 'lines';
}

function normalizeColorMode(value: unknown): VectorscopeColorMode {
    return VECTORSCOPE_COLOR_MODES.includes(value as VectorscopeColorMode) ? (value as VectorscopeColorMode) : 'solid';
}

/** Values at the labelled scope ticks, expressed in the source-sample domain. */
export function getVectorscopeScaleMarkers(scale: number): number[] {
    return [-scale, -scale / 2, -scale / 4, 0, scale / 4, scale / 2, scale];
}

function formatScaleMarker(value: number): string {
    const rounded = Math.abs(value) < 0.0005 ? 0 : value;
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(Math.abs(rounded) < 1 ? 2 : 1)}`;
}

function sourceIndexForPoint(index: number, sourceCount: number, pointCount: number): number {
    return Math.min(sourceCount - 1, Math.round((index * (sourceCount - 1)) / (pointCount - 1)));
}

function bandCoefficient(cutoffHz: number, sampleRate: number): number {
    return Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

function rgbComponent(value: number): number {
    return Math.round(clamp(Math.sqrt(Math.max(0, value)) * 255, 0, 255));
}

/**
 * Builds the RGB color stream used by MiniMeters-style point scopes: low, mid,
 * and high band energy becomes red, green, and blue respectively. The split is
 * made on the stereo sum so color expresses programme content, not stereo pan.
 */
export function buildVectorscopeRgbColors(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    pointCount: number
): string[] {
    const count = Math.min(left.length, right.length);
    const target = Math.max(2, Math.min(count, Math.floor(pointCount)));
    if (count < 2) return [];

    const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48_000;
    const lowCoefficient = bandCoefficient(RGB_LOW_CUTOFF_HZ, rate);
    const highCoefficient = bandCoefficient(RGB_HIGH_CUTOFF_HZ, rate);
    const envelopeCoefficient = Math.exp(-1 / (RGB_ENVELOPE_SECONDS * rate));
    const colors = new Array<string>(target);
    let lowPass = 0;
    let highPassSource = 0;
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let pointIndex = 0;

    for (let index = 0; index < count; index += 1) {
        const mono = ((left[index] ?? 0) + (right[index] ?? 0)) * 0.5;
        lowPass = lowCoefficient * lowPass + (1 - lowCoefficient) * mono;
        highPassSource = highCoefficient * highPassSource + (1 - highCoefficient) * mono;
        const low = lowPass;
        const high = mono - highPassSource;
        const mid = mono - low - high;
        lowEnergy = envelopeCoefficient * lowEnergy + (1 - envelopeCoefficient) * low * low;
        midEnergy = envelopeCoefficient * midEnergy + (1 - envelopeCoefficient) * mid * mid;
        highEnergy = envelopeCoefficient * highEnergy + (1 - envelopeCoefficient) * high * high;

        while (pointIndex < target && sourceIndexForPoint(pointIndex, count, target) === index) {
            colors[pointIndex] =
                `rgb(${rgbComponent(lowEnergy)}, ${rgbComponent(midEnergy)}, ${rgbComponent(highEnergy)})`;
            pointIndex += 1;
        }
    }
    return colors;
}

export function buildVectorscopePoints(
    left: Float32Array,
    right: Float32Array,
    width: number,
    height: number,
    pointCount: number,
    mode: VectorscopeMode = 'bipolar-scaled',
    scale = 1
): VectorscopePoint[] {
    const count = Math.min(left.length, right.length);
    const target = Math.max(2, Math.min(count, Math.floor(pointCount)));
    if (count < 2) return [];
    const points: VectorscopePoint[] = [];
    for (let index = 0; index < target; index += 1) {
        const sourceIndex = sourceIndexForPoint(index, count, target);
        const rawLeft = left[sourceIndex] ?? 0;
        const rawRight = right[sourceIndex] ?? 0;
        const level = Math.max(Math.abs(rawLeft), Math.abs(rawRight));
        // Values outside the display range deliberately remain out of bounds so the trace geometry
        // is preserved and clipped at the element edge.
        const l = rawLeft / scale;
        const r = rawRight / scale;
        const side = (l - r) / ROOT_TWO;
        const mid = (l + r) / ROOT_TWO;
        let normalizedX: number;
        let normalizedY: number;
        switch (mode) {
            case 'lissajous':
                normalizedX = l;
                normalizedY = r;
                break;
            case 'unipolar-scaled':
                normalizedX = Math.abs(side) / ROOT_TWO;
                normalizedY = Math.abs(mid) / ROOT_TWO;
                break;
            case 'unipolar-unscaled':
                normalizedX = Math.abs(side);
                normalizedY = Math.abs(mid);
                break;
            case 'bipolar-unscaled':
                normalizedX = side;
                normalizedY = mid;
                break;
            case 'bipolar-scaled':
            default:
                normalizedX = side / ROOT_TWO;
                normalizedY = mid / ROOT_TWO;
                break;
        }
        // Unipolar modes use a conventional lower-left origin; bipolar and Lissajous
        // modes retain a centered zero point. Scaled mid/side modes fit ±√2 in bounds.
        const isUnipolar = mode === 'unipolar-scaled' || mode === 'unipolar-unscaled';
        points.push({
            x: isUnipolar ? normalizedX * width : width / 2 + (normalizedX * width) / 2,
            y: isUnipolar ? height - normalizedY * height : height / 2 - (normalizedY * height) / 2,
            age: index / Math.max(1, target - 1),
            level,
        });
    }
    return points;
}

export class AudioVectorscopeElement extends BoundSceneElement {
    constructor(id: string = 'audioVectorscope', config: Record<string, unknown> = {}) {
        super('audioVectorscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Audio Vectorscope',
                description: 'Stereo mid/side XY display drawn from raw audio.',
                category: 'Audio Displays',
                presets: [
                    {
                        id: 'no-frills',
                        label: 'No Frills',
                        description: 'Black background with a white trace and grid.',
                        values: {
                            backgroundColor: '#000000',
                            backgroundOpacity: 1,
                            color: '#FFFFFF',
                            opacity: 1,
                            gridColor: '#FFFFFF',
                            gridOpacity: 0.5,
                            labelColor: '#FFFFFF',
                            labelOpacity: 0.5,
                            showLabels: true,
                            traceMode: 'lines',
                            traceWidth: 1.5,
                        },
                    },
                    {
                        id: 'just-trace',
                        label: 'Just Trace',
                        description: 'White trace without a background, grid, or labels.',
                        values: {
                            backgroundOpacity: 0,
                            gridOpacity: 0,
                            showLabels: false,
                            color: '#FFFFFF',
                            opacity: 1,
                        },
                    },
                ],
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'vectorscope',
                        label: 'Vectorscope',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 400, { min: 1, step: 1 }),
                            prop.number('height', 'Height (px)', 400, { min: 1, step: 1 }),
                            {
                                key: 'persistenceSeconds',
                                type: 'number',
                                label: 'Persistence (seconds)',
                                default: 0.1,
                                min: 0.01,
                                max: 2,
                                step: 0.01,
                                runtime: { transform: boundedNumber(0.01, 2), defaultValue: 0.1 },
                            },
                            {
                                key: 'pointCount',
                                type: 'number',
                                label: 'Point Density',
                                default: 1024,
                                min: 64,
                                max: 2048,
                                step: 1,
                                runtime: { transform: boundedNumber(64, 2048), defaultValue: 1024 },
                            },
                            {
                                key: 'scale',
                                type: 'number',
                                label: 'Display Scale',
                                default: 1,
                                min: 0.05,
                                max: 10,
                                step: 0.05,
                                runtime: { transform: boundedNumber(0.05, 10), defaultValue: 1 },
                            },
                            {
                                key: 'mode',
                                type: 'select',
                                label: 'Mode',
                                default: 'bipolar-scaled',
                                options: [
                                    { label: 'Unipolar Scaled', value: 'unipolar-scaled' },
                                    { label: 'Unipolar Unscaled', value: 'unipolar-unscaled' },
                                    { label: 'Bipolar Scaled', value: 'bipolar-scaled' },
                                    { label: 'Bipolar Unscaled', value: 'bipolar-unscaled' },
                                    { label: 'Lissajous', value: 'lissajous' },
                                ],
                                runtime: {
                                    transform: (value) => normalizeVectorscopeMode(value),
                                    defaultValue: 'bipolar-scaled',
                                },
                            },
                            {
                                key: 'traceMode',
                                type: 'select',
                                label: 'Trace Mode',
                                default: 'lines',
                                options: [
                                    { label: 'Lines', value: 'lines' },
                                    { label: 'Points', value: 'points' },
                                ],
                                runtime: { transform: (value) => normalizeTraceMode(value), defaultValue: 'lines' },
                            },
                            {
                                key: 'colorMode',
                                type: 'select',
                                label: 'Point Color',
                                default: 'solid',
                                options: [
                                    { label: 'Solid', value: 'solid' },
                                    { label: 'RGB (Frequency Bands)', value: 'rgb-meter' },
                                ],
                                visibleWhen: [{ key: 'traceMode', equals: 'points' }],
                                runtime: { transform: (value) => normalizeColorMode(value), defaultValue: 'solid' },
                            },
                            prop.number('traceWidth', 'Trace Width (px)', 1.5, { min: 0.25, max: 12, step: 0.25 }),
                            prop.boolean('showLabels', 'Show L/R Labels', true),
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true, label: 'Trace' }),
                    {
                        id: 'grid',
                        label: 'Grid',
                        collapsed: true,
                        properties: [
                            prop.color('gridColor', 'Grid Color', DEFAULT_GRID_COLOR),
                            prop.number('gridOpacity', 'Grid Opacity', 0.5, { min: 0, max: 1, step: 0.01 }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'gridOpacity' } },
                            { kind: 'property', propertyKey: 'gridOpacity' },
                        ],
                    },
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                            prop.number('backgroundOpacity', 'Background Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'backgroundOpacity' } },
                            { kind: 'property', propertyKey: 'backgroundOpacity' },
                        ],
                    },
                    {
                        id: 'labels',
                        label: 'Labels',
                        collapsed: true,
                        properties: [
                            prop.font('labelFontFamily', 'Font Family', 'BuiltIn:inter|400'),
                            prop.number('labelFontSize', 'Font Size (px)', 11, { min: 6, max: 72, step: 1 }),
                            prop.color('labelColor', 'Color', DEFAULT_GRID_COLOR),
                            prop.number('labelOpacity', 'Opacity', 0.5, { min: 0, max: 1, step: 0.01 }),
                            prop.number('labelLetterSpacing', 'Letter Spacing', 0, { min: -10, max: 20, step: 0.5 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = Math.max(1, props.width ?? 400);
        const height = Math.max(1, props.height ?? 400);
        const objects: RenderObject[] = [
            new Rectangle(0, 0, width, height, {
                fillColor: applyOpacity(
                    props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
                    props.backgroundOpacity ?? 1
                ),
            }),
        ];
        const message = (text: string) => {
            objects.push(
                new Text(8, height / 2, text, '12px Inter, sans-serif', {
                    color: '#94a3b8',
                    baseline: 'middle',
                }).setLayoutParticipation('exclude')
            );
            return objects;
        };
        if (!props.audioTrackId) return message('Select an audio track');
        const audio = getEnginePrivateContext(this).audio;
        if (!audio) return message('Audio not available');
        const persistence = clamp(props.persistenceSeconds ?? 0.1, 0.01, 2);
        const startSeconds = Math.max(0, targetTime - persistence);
        const left = audio.getRawSamples({
            trackId: props.audioTrackId,
            startSeconds,
            endSeconds: targetTime,
            channel: 'left',
        });
        if (!left.ok || left.value.length < 2) return message('No vectorscope data');
        const rightResult = audio.getRawSamples({
            trackId: props.audioTrackId,
            startSeconds,
            endSeconds: targetTime,
            channel: 'right',
        });
        const right = rightResult.ok ? rightResult.value : left.value;
        const mode = normalizeVectorscopeMode(props.mode);
        const scale = clamp(props.scale ?? 1, 0.05, 10);
        this.addGrid(
            objects,
            width,
            height,
            props.gridColor ?? DEFAULT_GRID_COLOR,
            props.gridOpacity ?? 0.5,
            props.showLabels !== false,
            props.labelFontFamily ?? 'BuiltIn:inter|400',
            props.labelFontSize ?? 11,
            props.labelColor ?? DEFAULT_GRID_COLOR,
            props.labelOpacity ?? 0.5,
            props.labelLetterSpacing ?? 0,
            mode,
            scale
        );
        const points = buildVectorscopePoints(
            left.value,
            right,
            width,
            height,
            clamp(Math.round(props.pointCount ?? 1024), 64, 2048),
            mode,
            scale
        );
        if (!points.length) return message('No vectorscope data');
        const traceColor = props.color ?? DEFAULT_TRACE_COLOR;
        const traceOpacity = clamp(props.opacity ?? 1, 0, 1);
        const traceWidth = Math.max(0.25, props.traceWidth ?? 1.5);
        const traceMode = normalizeTraceMode(props.traceMode);
        const colorMode = normalizeColorMode(props.colorMode);
        const traceLayer = new ClipLayer(width, height, { layoutParticipation: 'exclude' });
        if (traceMode === 'points') {
            const pointSize = Math.max(1, traceWidth);
            const minimumDotOpacity = colorMode === 'rgb-meter' ? 0.42 : 0.18;
            const channelMetadata = audio.getChannelMetadata(props.audioTrackId);
            const sampleRate = channelMetadata.ok ? channelMetadata.value.sampleRate : 48_000;
            const rgbColors =
                colorMode === 'rgb-meter'
                    ? buildVectorscopeRgbColors(left.value, right, sampleRate, points.length)
                    : [];
            for (const [index, point] of points.entries()) {
                const color = rgbColors[index] ?? traceColor;
                const dot = new Rectangle(point.x - pointSize / 2, point.y - pointSize / 2, pointSize, pointSize, {
                    fillColor: applyOpacity(
                        color,
                        traceOpacity * (minimumDotOpacity + (1 - minimumDotOpacity) * point.age)
                    ),
                    layoutParticipation: 'exclude',
                });
                dot.blendMode =
                    props.blendMode === 'source-over' ? null : (props.blendMode as GlobalCompositeOperation);
                traceLayer.addChild(dot);
            }
            objects.push(traceLayer);
            return objects;
        }
        const segmentCount = 6;
        for (let segment = 0; segment < segmentCount; segment += 1) {
            const start = Math.floor((segment * (points.length - 1)) / segmentCount);
            const end = Math.min(points.length, Math.floor(((segment + 1) * (points.length - 1)) / segmentCount) + 2);
            const trace = new Poly(points.slice(start, end), {
                fillColor: null,
                strokeColor: applyOpacity(traceColor, traceOpacity * (0.18 + (0.82 * (segment + 1)) / segmentCount)),
                strokeWidth: traceWidth,
                layoutParticipation: 'exclude',
            });
            trace.setClosed(false).setLineJoin('round').setLineCap('round');
            trace.blendMode = props.blendMode === 'source-over' ? null : (props.blendMode as GlobalCompositeOperation);
            traceLayer.addChild(trace);
        }
        objects.push(traceLayer);
        return objects;
    }

    private addGrid(
        objects: RenderObject[],
        width: number,
        height: number,
        color: string,
        opacity: number,
        showLabels: boolean,
        fontSelection: string,
        fontSize: number,
        labelColor: string,
        labelOpacity: number,
        labelLetterSpacing: number,
        mode: VectorscopeMode,
        scale: number
    ): void {
        const gridColor = applyOpacity(color, clamp(opacity, 0, 1));
        const { family, weight } = parseFontSelection(fontSelection);
        const labelFont = `${weight ?? '400'} ${clamp(fontSize, 6, 72)}px ${family || 'Inter'}, sans-serif`;
        const resolvedLabelColor = applyOpacity(labelColor, clamp(labelOpacity, 0, 1));
        const addLine = (x: number, y: number, dx: number, dy: number) =>
            objects.push(
                new Line(x, y, x + dx, y + dy, { color: gridColor, lineWidth: 1, layoutParticipation: 'exclude' })
            );
        const addLabel = (x: number, y: number, text: string, align: CanvasTextAlign = 'left') =>
            objects.push(
                new Text(x, y, text, labelFont, {
                    color: resolvedLabelColor,
                    align,
                    letterSpacing: clamp(labelLetterSpacing, -10, 20),
                }).setLayoutParticipation('exclude')
            );
        const addScaleMarkers = (centered: boolean) => {
            if (!showLabels) return;
            const markerValues = getVectorscopeScaleMarkers(scale);
            const positive = markerValues.filter((value) => value > 0);
            if (centered) {
                for (const value of positive) {
                    const ratio = value / markerValues.at(-1)!;
                    addLabel(width / 2 + (ratio * width) / 2 - 3, height / 2 - 4, formatScaleMarker(value), 'right');
                    addLabel(width / 2 - (ratio * width) / 2 + 3, height / 2 - 4, formatScaleMarker(-value));
                }
            } else {
                for (const value of positive) {
                    const ratio = value / markerValues.at(-1)!;
                    addLabel(ratio * width - 3, height - 4, formatScaleMarker(value), 'right');
                    addLabel(3, height - ratio * height - 3, formatScaleMarker(value));
                }
            }
        };

        if (mode === 'unipolar-scaled' || mode === 'unipolar-unscaled') {
            // The trace occupies one positive mid/side quadrant, so use a 0–1 graticule.
            for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
                addLine(ratio * width, 0, 0, height);
                addLine(0, ratio * height, width, 0);
            }
            if (showLabels) {
                addLabel(4, 12, 'Mid');
                addLabel(width - 4, height - 16, 'Side', 'right');
            }
            addScaleMarkers(false);
            return;
        }

        addLine(width / 2, 0, 0, height);
        addLine(0, height / 2, width, 0);
        if (mode === 'lissajous') {
            // Direct left-vs-right plotting uses Cartesian channel axes rather than phase diagonals.
            for (const ratio of [0.25, 0.75]) {
                addLine(ratio * width, 0, 0, height);
                addLine(0, ratio * height, width, 0);
            }
            if (showLabels) {
                addLabel(4, height / 2 - 6, 'L−');
                addLabel(width - 4, height / 2 - 6, 'L+', 'right');
                addLabel(width / 2 + 4, 12, 'R+');
                addLabel(width / 2 + 4, height - 6, 'R−');
            }
            addScaleMarkers(true);
            return;
        }

        // Centered bipolar mid/side graticule: diagonal guides mark the in/out-of-phase axes.
        addLine(0, height, width, -height);
        addLine(0, 0, width, height);
        if (showLabels) {
            addLabel(4, height / 2 - 6, 'S−');
            addLabel(width - 4, height / 2 - 6, 'S+', 'right');
            addLabel(width / 2 + 4, 12, 'M+');
            addLabel(width / 2 + 4, height - 6, 'M−');
        }
        addScaleMarkers(true);
    }
}

export const audioVectorscope = defineHostAdaptedBuiltIn(
    {
        type: 'audioVectorscope',
        metadata: { name: 'Audio Vectorscope', description: 'Stereo mid/side XY display', category: 'Audio Displays' },
        capabilities: { required: ['audio.raw.read'], optional: [] },
    },
    AudioVectorscopeElement
);
