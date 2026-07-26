import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { ClipLayer, Line, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { applyOpacity } from '@utils/color';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/plugins/built-in-definition';
import type { AudioSpectrumScale } from './audio-spectrum';
import {
    getSpectrogramTile,
    getSpectrogramTileRange,
    SPECTROGRAM_COLOR_MAPS,
    SPECTROGRAM_TILE_COLUMNS,
    SpectrogramTileRenderObject,
    type SpectrogramColorMap,
} from './spectrogram-tiles';

export { buildSpectrogramPixels } from './spectrogram-tiles';

const DEFAULT_BACKGROUND_COLOR = '#0F172A';
const DEFAULT_PLAYHEAD_COLOR = '#E2E8F0';
const MAX_GRID_COLUMNS = 512;
const MAX_GRID_ROWS = 256;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function normalizeScale(value: unknown): AudioSpectrumScale {
    return value === 'linear' || value === 'log' || value === 'mel' ? value : 'log';
}

function normalizeColorMap(value: unknown): SpectrogramColorMap {
    return SPECTROGRAM_COLOR_MAPS.includes(value as SpectrogramColorMap)
        ? (value as SpectrogramColorMap)
        : 'viridis';
}

const positiveNumber = (fallback: number, min: number, max: number): PropertyTransform<number, SceneElementInterface> =>
    (value, element) => {
        const numeric = asNumber(value, element);
        return numeric === undefined ? undefined : clamp(numeric, min, max);
    };

export class AudioSpectrogramElement extends SceneElement {
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
                    { key: 'colorMap', type: 'select', label: 'Color Map', default: 'viridis', options: SPECTROGRAM_COLOR_MAPS.map((value) => ({ label: value[0]!.toUpperCase() + value.slice(1), value })), runtime: { transform: (value) => normalizeColorMap(value), defaultValue: 'viridis' } },
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
        const stepSeconds = windowSeconds / Math.max(1, cols - 1);
        const gain = clamp(props.gain ?? 1, 0, 10);
        const columnWidth = cols > 1 ? width / (cols - 1) : width;
        const lastVisibleSeconds = props.seeFuture === true ? endSeconds : targetTime;
        const { firstTile, lastTile } = getSpectrogramTileRange(
            startSeconds,
            lastVisibleSeconds,
            stepSeconds
        );
        const clipWidth = props.seeFuture === true ? width : width * playheadPosition;
        const tiles = new ClipLayer(Math.max(0, clipWidth), height, { layoutParticipation: 'exclude' });
        tiles.blendMode =
            props.blendMode === 'source-over' ? null : props.blendMode as GlobalCompositeOperation;
        let hasData = false;
        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex += 1) {
            const resource = getSpectrogramTile({
                trackId: props.audioTrackId,
                tileIndex,
                stepSeconds,
                rows,
                sampleRate,
                scale: normalizeScale(props.scale),
                minFrequency: props.minFrequency ?? 20,
                maxFrequency: props.maxFrequency ?? 20000,
                minDecibels: props.minDecibels ?? -80,
                maxDecibels: props.maxDecibels ?? 0,
                gain,
                colorMap: normalizeColorMap(props.colorMap),
            });
            if (!resource) continue;
            hasData = true;
            const tileStartSeconds = tileIndex * SPECTROGRAM_TILE_COLUMNS * stepSeconds;
            const x = ((tileStartSeconds - startSeconds) / stepSeconds) * columnWidth;
            tiles.addChild(new SpectrogramTileRenderObject(
                resource,
                x,
                0,
                SPECTROGRAM_TILE_COLUMNS * columnWidth,
                height,
                { layoutParticipation: 'exclude' }
            ));
        }
        if (!hasData) return message('No spectrogram data');
        objects.push(tiles);
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
