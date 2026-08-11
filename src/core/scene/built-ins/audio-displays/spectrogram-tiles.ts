import { BoxRenderObject } from '@core/render/render-objects/box';
import type { RenderConfig, RenderObjectOptions } from '@core/render/render-objects/base';
import { RenderResourceManager, renderResourceManager } from '@core/render/render-resource-manager';
import { convertSpectrogramBins, type AudioSpectrumScale } from './audio-spectrum';
import { getHostAudioFeatureMatrixRevision, readHostAudioFeatureMatrix } from '@core/render/audio-feature-matrix-host';

/**
 * Immutable, content-addressed spectrogram tiles.
 *
 * Scene elements derive tile keys only from current render inputs. The cache is deliberately
 * outside element and render-object state: a hit, miss, or eviction can change render cost but
 * cannot change the pixels produced for a key.
 */
export const SPECTROGRAM_TILE_COLUMNS = 128;
const SPECTROGRAM_TILE_CACHE_BYTES = 64 * 1024 * 1024;

export const SPECTROGRAM_COLOR_MAPS = ['viridis', 'magma', 'inferno', 'grayscale', 'custom'] as const;
export type SpectrogramColorMap = (typeof SPECTROGRAM_COLOR_MAPS)[number];
type PresetSpectrogramColorMap = Exclude<SpectrogramColorMap, 'custom'>;
export type SpectrogramCustomColors = readonly [string, string, string];

export const DEFAULT_SPECTROGRAM_CUSTOM_COLORS: SpectrogramCustomColors = ['#440154', '#21918C', '#FDE725'];

const COLOR_STOPS: Record<PresetSpectrogramColorMap, readonly [number, number, number][]> = {
    viridis: [
        [68, 1, 84],
        [59, 82, 139],
        [33, 145, 140],
        [94, 201, 98],
        [253, 231, 37],
    ],
    magma: [
        [0, 0, 4],
        [73, 15, 109],
        [182, 54, 121],
        [251, 136, 97],
        [252, 253, 191],
    ],
    inferno: [
        [0, 0, 4],
        [87, 15, 109],
        [187, 55, 84],
        [249, 142, 8],
        [252, 255, 164],
    ],
    grayscale: [
        [0, 0, 0],
        [255, 255, 255],
    ],
};

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

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

function parseHexColor(value: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value.trim());
    if (!match) return null;
    const hex = match[1]!;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function customColorStops(colors: SpectrogramCustomColors): readonly [number, number, number][] {
    return colors.map(
        (color, index) => parseHexColor(color) ?? parseHexColor(DEFAULT_SPECTROGRAM_CUSTOM_COLORS[index])!
    ) as [number, number, number][];
}

export function resolveSpectrogramColorStops(
    colorMap: SpectrogramColorMap,
    customColors: SpectrogramCustomColors = DEFAULT_SPECTROGRAM_CUSTOM_COLORS
): readonly [number, number, number][] {
    return colorMap === 'custom' ? customColorStops(customColors) : COLOR_STOPS[colorMap];
}

export function buildSpectrogramPixels(
    frames: Array<readonly number[] | undefined>,
    rows: number,
    minDecibels: number,
    maxDecibels: number,
    colorMap: SpectrogramColorMap,
    scale: AudioSpectrumScale,
    sampleRate: number,
    minFrequency: number,
    maxFrequency: number,
    customColors?: SpectrogramCustomColors
): Uint8ClampedArray {
    const safeRows = Math.max(1, Math.floor(rows));
    const pixels = new Uint8ClampedArray(frames.length * safeRows * 4);
    const range = Math.max(1e-6, maxDecibels - minDecibels);
    const stops = resolveSpectrogramColorStops(colorMap, customColors);

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

export interface SpectrogramTileResource {
    readonly key: string;
    readonly drawable: CanvasImageSource;
    readonly width: number;
    readonly height: number;
    readonly byteSize: number;
}

export class SpectrogramTileCache {
    private readonly manager: RenderResourceManager;
    private readonly wrappers = new Map<string, SpectrogramTileResource>();

    constructor(maxBytes = SPECTROGRAM_TILE_CACHE_BYTES, manager?: RenderResourceManager) {
        this.manager = manager ?? new RenderResourceManager(maxBytes, maxBytes);
    }

    getOrCreate(
        key: string,
        width: number,
        height: number,
        buildPixels: () => Uint8ClampedArray
    ): SpectrogramTileResource {
        const result = this.manager.generatedRaster({
            namespace: 'builtin:spectrogram',
            contentKey: key,
            width,
            height,
            format: 'rgba8',
            build: buildPixels,
        });
        const existing = this.wrappers.get(key);
        if (result.cacheHit && existing) return existing;
        const wrapper = Object.freeze({
            key,
            drawable: result.resource.frames[0]!.drawable!,
            width,
            height,
            byteSize: width * height * 4,
        });
        this.wrappers.set(key, wrapper);
        return wrapper;
    }

    clear(): void {
        this.manager.clear();
        this.wrappers.clear();
    }

    getStats(): { entries: number; retainedBytes: number } {
        const diagnostics = this.manager.getDiagnostics();
        return { entries: diagnostics.rasterEntries, retainedBytes: diagnostics.rasterBytes };
    }
}

export class SpectrogramTileRenderObject extends BoxRenderObject {
    constructor(
        private readonly resource: SpectrogramTileResource,
        x: number,
        y: number,
        width: number,
        height: number,
        options?: RenderObjectOptions
    ) {
        super(x, y, width, height, options);
    }

    protected override _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.resource.drawable, 0, 0, this.width, this.height);
        ctx.imageSmoothingEnabled = smoothing;
    }
}

export interface SpectrogramTileRequest {
    trackId: string;
    analysisProfileId?: string | null;
    tileIndex: number;
    stepSeconds: number;
    rows: number;
    sampleRate: number;
    scale: AudioSpectrumScale;
    minFrequency: number;
    maxFrequency: number;
    minDecibels: number;
    maxDecibels: number;
    gain: number;
    colorMap: SpectrogramColorMap;
    customColors?: SpectrogramCustomColors;
}

export function getSpectrogramTileRange(
    startSeconds: number,
    endSeconds: number,
    stepSeconds: number
): { firstTile: number; lastTile: number } {
    const safeStep = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : 1;
    const firstColumn = Math.floor(Math.min(startSeconds, endSeconds) / safeStep);
    const lastColumn = Math.ceil(Math.max(startSeconds, endSeconds) / safeStep);
    return {
        firstTile: Math.floor(firstColumn / SPECTROGRAM_TILE_COLUMNS),
        lastTile: Math.floor(lastColumn / SPECTROGRAM_TILE_COLUMNS),
    };
}

const spectrogramTileCache = new SpectrogramTileCache(SPECTROGRAM_TILE_CACHE_BYTES, renderResourceManager);

function stableNumber(value: number): string {
    if (!Number.isFinite(value)) return 'invalid';
    return Object.is(value, -0) ? '-0' : String(value);
}

function sampleSpectrogramTileFrames(
    request: SpectrogramTileRequest
): { revision: string; frames: Array<readonly number[] | undefined> } | null {
    const firstColumn = request.tileIndex * SPECTROGRAM_TILE_COLUMNS;
    const matrix = readHostAudioFeatureMatrix({
        trackId: request.trackId,
        featureKey: 'spectrogram',
        analysisProfileId: request.analysisProfileId,
        strictProfileMatching: true,
        startSeconds: firstColumn * request.stepSeconds,
        stepSeconds: request.stepSeconds,
        frameCount: SPECTROGRAM_TILE_COLUMNS,
        interpolation: 'linear',
    });
    if (!matrix) return null;
    const frames: Array<readonly number[] | undefined> = new Array(SPECTROGRAM_TILE_COLUMNS);
    for (let column = 0; column < SPECTROGRAM_TILE_COLUMNS; column += 1) {
        const values = new Array<number>(matrix.valuesPerFrame);
        for (let bin = 0; bin < matrix.valuesPerFrame; bin += 1) {
            const value = matrix.data[column * matrix.valuesPerFrame + bin]!;
            values[bin] = (value + 80) * request.gain - 80;
        }
        frames[column] = values;
    }
    return { revision: matrix.revision, frames };
}

export function buildSpectrogramTileKey(revision: string, request: SpectrogramTileRequest): string {
    return [
        revision,
        request.trackId,
        request.analysisProfileId ?? 'default',
        request.tileIndex,
        stableNumber(request.stepSeconds),
        request.rows,
        stableNumber(request.sampleRate),
        request.scale,
        stableNumber(request.minFrequency),
        stableNumber(request.maxFrequency),
        stableNumber(request.minDecibels),
        stableNumber(request.maxDecibels),
        stableNumber(request.gain),
        request.colorMap,
        ...(request.colorMap === 'custom' ? (request.customColors ?? DEFAULT_SPECTROGRAM_CUSTOM_COLORS) : []),
    ].join('|');
}

export function getSpectrogramTile(request: SpectrogramTileRequest): SpectrogramTileResource | null {
    const revision = getHostAudioFeatureMatrixRevision(request.trackId, 'spectrogram', request.analysisProfileId, true);
    if (!revision) return null;
    const key = buildSpectrogramTileKey(revision, request);
    return spectrogramTileCache.getOrCreate(key, SPECTROGRAM_TILE_COLUMNS, request.rows, () => {
        const sampled = sampleSpectrogramTileFrames(request);
        if (!sampled) {
            return new Uint8ClampedArray(SPECTROGRAM_TILE_COLUMNS * request.rows * 4);
        }
        return buildSpectrogramPixels(
            sampled.frames,
            request.rows,
            request.minDecibels,
            request.maxDecibels,
            request.colorMap,
            request.scale,
            request.sampleRate,
            request.minFrequency,
            request.maxFrequency,
            request.customColors
        );
    });
}

/**
 * Discard rendered spectrogram tiles when the backing scene is replaced.
 *
 * Tile pixels are derived from the active timeline store, so they must never
 * survive a document import even if the next scene reuses the same element
 * and track IDs.
 */
export function clearSpectrogramTileCache(): void {
    spectrogramTileCache.clear();
}

export const clearSpectrogramTileCacheForTests = clearSpectrogramTileCache;

export function getSpectrogramTileCacheStats(): { entries: number; retainedBytes: number } {
    return spectrogramTileCache.getStats();
}
