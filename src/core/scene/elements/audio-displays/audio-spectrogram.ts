import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Line, PixelGrid, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { applyOpacity } from '@utils/color';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/plugins/built-in-definition';
import { convertSpectrogramBins, type AudioSpectrumScale } from './audio-spectrum';

const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const DEFAULT_PLAYHEAD_COLOR = '#E2E8F0';
const MAX_GRID_COLUMNS = 512;
const MAX_GRID_ROWS = 256;

const COLOR_MAPS = ['viridis', 'magma', 'inferno', 'grayscale'] as const;
type ColorMap = (typeof COLOR_MAPS)[number];

const COLOR_STOPS: Record<ColorMap, readonly [number, number, number][]> = {
    viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
    magma: [[0, 0, 4], [73, 15, 109], [182, 54, 121], [251, 136, 97], [252, 253, 191]],
    inferno: [[0, 0, 4], [87, 15, 109], [187, 55, 84], [249, 142, 8], [252, 255, 164]],
    grayscale: [[0, 0, 0], [255, 255, 255]],
};

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function normalizeScale(value: unknown): AudioSpectrumScale {
    return value === 'linear' || value === 'log' || value === 'mel' ? value : 'log';
}

function normalizeColorMap(value: unknown): ColorMap {
    return COLOR_MAPS.includes(value as ColorMap) ? (value as ColorMap) : 'viridis';
}

const positiveNumber = (fallback: number, min: number, max: number): PropertyTransform<number, SceneElementInterface> =>
    (value, element) => {
        const numeric = asNumber(value, element);
        return numeric === undefined ? undefined : clamp(numeric, min, max);
    };

function interpolateColor(stops: readonly [number, number, number][], amount: number): [number, number, number] {
    const scaled = clamp(amount, 0, 1) * (stops.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(stops.length - 1, lower + 1);
    const mix = scaled - lower;
    const from = stops[lower]!;
    const to = stops[upper]!;
    return [
        Math.round(from[0] + (to[0] - from[0]) * mix),
        Math.round(from[1] + (to[1] - from[1]) * mix),
        Math.round(from[2] + (to[2] - from[2]) * mix),
    ];
}

export function buildSpectrogramPixels(
    frames: Array<readonly number[] | undefined>,
    rows: number,
    minDecibels: number,
    maxDecibels: number,
    colorMap: ColorMap,
    scale: AudioSpectrumScale,
    sampleRate: number,
    minFrequency: number,
    maxFrequency: number
): Uint8ClampedArray {
    const safeRows = Math.max(1, Math.floor(rows));
    const pixels = new Uint8ClampedArray(frames.length * safeRows * 4);
    const range = Math.max(1e-6, maxDecibels - minDecibels);
    const stops = COLOR_STOPS[colorMap];

    frames.forEach((frame, column) => {
        if (!frame?.length) return;
        const bands = convertSpectrogramBins({
            values: frame,
            sampleRate,
            minFrequency,
            maxFrequency,
            targetBinCount: safeRows,
            scale,
        });
        for (let row = 0; row < safeRows; row += 1) {
            const decibels = bands[safeRows - 1 - row] ?? minDecibels;
            const intensity = clamp((decibels - minDecibels) / range, 0, 1);
            const [red, green, blue] = interpolateColor(stops, intensity);
            const offset = (row * frames.length + column) * 4;
            pixels[offset] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = 255;
        }
    });
    return pixels;
}

export class AudioSpectrogramElement extends SceneElement {
    private _frameCacheKey: string | null = null;
    private _frames = new Map<number, readonly number[]>();

    constructor(id: string = 'audioSpectrogram', config: Record<string, unknown> = {}) {
        super('audioSpectrogram', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(super.getConfigSchema(), {
            name: 'Audio Spectrogram', description: 'Scrolling frequency heatmap for an audio track.', category: 'Audio Displays',
        }, [
            tab.content([
                propGroup.audioSource(),
                { id: 'spectrogram', label: 'Spectrogram', collapsed: false, properties: [
                    prop.number('width', 'Width (px)', 800, { min: 1, step: 1 }),
                    prop.number('height', 'Height (px)', 300, { min: 1, step: 1 }),
                    { key: 'windowSeconds', type: 'number', label: 'Window (seconds)', default: 6, min: 0.1, max: 60, step: 0.1, runtime: { transform: positiveNumber(6, 0.1, 60), defaultValue: 6 } },
                    { key: 'playheadPosition', type: 'range', label: 'Playhead Position', default: 0.5, min: 0, max: 1, step: 0.01, runtime: { transform: positiveNumber(0.5, 0, 1), defaultValue: 0.5 } },
                    prop.boolean('seeFuture', 'See Future', false),
                    prop.boolean('showPlayhead', 'Show Playhead', true),
                    prop.color('playheadColor', 'Playhead Color', DEFAULT_PLAYHEAD_COLOR),
                    { key: 'scale', type: 'select', label: 'Frequency Scale', default: 'log', options: [{ label: 'Linear', value: 'linear' }, { label: 'Logarithmic', value: 'log' }, { label: 'Mel', value: 'mel' }], runtime: { transform: (value) => normalizeScale(value), defaultValue: 'log' } },
                    prop.number('minFrequency', 'Min Frequency (Hz)', 20, { min: 0, max: 48000, step: 1 }),
                    prop.number('maxFrequency', 'Max Frequency (Hz)', 20000, { min: 1, max: 48000, step: 1 }),
                    prop.number('minDecibels', 'Minimum Value', -80, { min: -120, max: 0, step: 1 }),
                    prop.number('maxDecibels', 'Maximum Value', 0, { min: -120, max: 0, step: 1 }),
                    prop.number('gain', 'Gain', 1, { min: 0, max: 10, step: 0.01 }),
                    { key: 'colorMap', type: 'select', label: 'Color Map', default: 'viridis', options: COLOR_MAPS.map((value) => ({ label: value[0]!.toUpperCase() + value.slice(1), value })), runtime: { transform: (value) => normalizeColorMap(value), defaultValue: 'viridis' } },
                ] },
            ]),
            tab.appearance([
                propGroup.appearance({ blendMode: true }),
                { id: 'background', label: 'Background', collapsed: true, properties: [
                    prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                    prop.range('backgroundOpacity', 'Background Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                ] },
            ]),
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = Math.max(1, props.width ?? 800);
        const height = Math.max(1, props.height ?? 300);
        const objects: RenderObject[] = [new Rectangle(0, 0, width, height, { fillColor: applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 1) })];
        const message = (text: string) => {
            objects.push(new Text(8, height / 2, text, '12px Inter, sans-serif', { color: '#94a3b8', baseline: 'middle' }).setLayoutParticipation('exclude'));
            return objects;
        };
        if (!props.audioTrackId) return message('Select an audio track');
        const audio = getEnginePrivateContext(this).audio;
        if (!audio) return message('Audio not available');

        const metadata = audio.getChannelMetadata(props.audioTrackId);
        const sampleRate = metadata.ok ? metadata.value.sampleRate : 44100;
        const cols = clamp(Math.round(width), 1, MAX_GRID_COLUMNS);
        const rows = clamp(Math.round(height), 1, MAX_GRID_ROWS);
        const windowSeconds = clamp(props.windowSeconds ?? 6, 0.1, 60);
        const playheadPosition = clamp(props.playheadPosition ?? 0.5, 0, 1);
        const startSeconds = targetTime - windowSeconds * playheadPosition;
        const endSeconds = targetTime + windowSeconds * (1 - playheadPosition);
        const visibleEndSeconds = props.seeFuture === true ? endSeconds : Math.min(endSeconds, targetTime);
        const stepSeconds = windowSeconds / Math.max(1, cols - 1);
        const key = [props.audioTrackId, stepSeconds, props.scale, props.minFrequency, props.maxFrequency].join(':');
        if (key !== this._frameCacheKey) { this._frameCacheKey = key; this._frames.clear(); }

        const requestStart = Math.max(0, startSeconds);
        const requiredIndices: number[] = [];
        for (let column = 0; column < cols; column += 1) {
            const time = startSeconds + column * stepSeconds;
            if (time >= 0 && time <= visibleEndSeconds) requiredIndices.push(Math.round(time / stepSeconds));
        }
        if (visibleEndSeconds >= requestStart && requiredIndices.some((index) => !this._frames.has(index))) {
            const request = audio.sampleFeatureRange({ trackId: props.audioTrackId, feature: 'spectrogram', startSeconds: requestStart, endSeconds: visibleEndSeconds, stepSeconds });
            if (request.ok) request.value.forEach((frame, index) => {
                const cacheIndex = Math.round((requestStart + index * stepSeconds) / stepSeconds);
                if (Array.isArray(frame.value)) this._frames.set(cacheIndex, frame.value);
            });
        }
        if (this._frames.size > 4096) this._frames.clear();

        const frames: Array<readonly number[] | undefined> = [];
        for (let column = 0; column < cols; column += 1) {
            const time = startSeconds + column * stepSeconds;
            frames.push(time < 0 || (!props.seeFuture && time > targetTime) ? undefined : this._frames.get(Math.round(time / stepSeconds)));
        }
        if (!frames.some(Boolean)) return message('No spectrogram data');
        const gain = clamp(props.gain ?? 1, 0, 10);
        const pixels = buildSpectrogramPixels(frames.map((frame) => frame?.map((value) => (value + 80) * gain - 80)), rows, props.minDecibels ?? -80, props.maxDecibels ?? 0, normalizeColorMap(props.colorMap), normalizeScale(props.scale), sampleRate, props.minFrequency ?? 20, props.maxFrequency ?? 20000);
        const grid = new PixelGrid(0, 0, cols, rows, 1, { pixels, layoutParticipation: 'exclude' });
        grid.setSize(width, height);
        grid.blendMode = props.blendMode === 'source-over' ? null : props.blendMode as GlobalCompositeOperation;
        objects.push(grid);
        if (props.showPlayhead !== false) {
            const x = width * playheadPosition;
            const line = new Line(x, 0, x, height, { color: applyOpacity(props.playheadColor ?? DEFAULT_PLAYHEAD_COLOR, props.opacity ?? 1), lineWidth: 1, layoutParticipation: 'exclude' });
            objects.push(line);
        }
        return objects;
    }
}

export const audioSpectrogram = defineHostAdaptedBuiltIn({
    type: 'audioSpectrogram', metadata: { name: 'Audio Spectrogram', description: 'Scrolling frequency heatmap', category: 'Audio Displays' },
    capabilities: { required: ['audio.features.read'], optional: [] }, featureRequirements: [{ feature: 'spectrogram' }],
}, AudioSpectrogramElement);
