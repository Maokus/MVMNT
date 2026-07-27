import type { VisualResource } from '@core/resources/visual-resource';

export const DEFAULT_RENDER_RESOURCE_BUDGET_BYTES = 256 * 1024 * 1024;
export const DEFAULT_RENDER_NAMESPACE_BUDGET_BYTES = 64 * 1024 * 1024;
export const MAX_GENERATED_RASTER_BYTES = 64 * 1024 * 1024;

export interface GeneratedRasterRequest {
    readonly namespace: string;
    readonly contentKey: string;
    readonly width: number;
    readonly height: number;
    readonly format: 'rgba8';
    readonly build: () => Uint8ClampedArray;
}

export interface GeneratedRasterResult {
    readonly resource: VisualResource;
    readonly cacheHit: boolean;
}

export interface RenderResourceDiagnostics {
    readonly rasterHits: number;
    readonly rasterMisses: number;
    readonly rasterEvictions: number;
    readonly rasterEntries: number;
    readonly rasterBytes: number;
    readonly rasterBuildMilliseconds: number;
    readonly scratchAllocations: number;
    readonly scratchReuses: number;
}

type SurfaceCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface ScratchSurfaceLease {
    readonly canvas: SurfaceCanvas;
    readonly context: CanvasRenderingContext2D;
    release(): void;
}

interface RasterEntry {
    readonly resource: VisualResource;
    readonly namespace: string;
    readonly byteSize: number;
}

function closeDrawable(drawable: CanvasImageSource | null): void {
    if (drawable && typeof ImageBitmap !== 'undefined' && drawable instanceof ImageBitmap) {
        drawable.close();
    }
}

function createSurface(width: number, height: number): SurfaceCanvas {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    throw new Error('Canvas rendering is unavailable');
}

function get2dContext(canvas: SurfaceCanvas): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas context could not be created');
    return context as unknown as CanvasRenderingContext2D;
}

function resetContext(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, width, height);
}

/**
 * Host-owned mutable resource state. Cached rasters are immutable and addressed
 * solely by namespace + content key; scratch surfaces are callback-scoped leases.
 */
export class RenderResourceManager {
    private readonly rasters = new Map<string, RasterEntry>();
    private readonly namespaceBytes = new Map<string, number>();
    private readonly scratch = new Map<string, SurfaceCanvas[]>();
    private retainedBytes = 0;
    private rasterHits = 0;
    private rasterMisses = 0;
    private rasterEvictions = 0;
    private rasterBuildMilliseconds = 0;
    private scratchAllocations = 0;
    private scratchReuses = 0;

    constructor(
        private readonly totalBudgetBytes = DEFAULT_RENDER_RESOURCE_BUDGET_BYTES,
        private readonly namespaceBudgetBytes = DEFAULT_RENDER_NAMESPACE_BUDGET_BYTES
    ) {}

    generatedRaster(request: GeneratedRasterRequest): GeneratedRasterResult {
        const width = request.width;
        const height = request.height;
        if (!request.namespace || !request.contentKey)
            throw new RangeError('Raster namespace and contentKey are required');
        if (request.format !== 'rgba8') throw new RangeError("Only the 'rgba8' raster format is supported");
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
            throw new RangeError('Raster dimensions must be positive finite integers');
        }
        const byteSize = width * height * 4;
        if (!Number.isSafeInteger(byteSize) || byteSize > MAX_GENERATED_RASTER_BYTES) {
            throw new RangeError(`Generated raster exceeds the ${MAX_GENERATED_RASTER_BYTES}-byte resource limit`);
        }
        const key = `${request.namespace}\u0000${request.contentKey}\u0000${width}x${height}:${request.format}`;
        const existing = this.rasters.get(key);
        if (existing) {
            this.rasters.delete(key);
            this.rasters.set(key, existing);
            this.rasterHits += 1;
            return { resource: existing.resource, cacheHit: true };
        }

        this.rasterMisses += 1;
        const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const built = request.build();
        this.rasterBuildMilliseconds += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
        if (!(built instanceof Uint8ClampedArray) || built.length !== byteSize) {
            throw new RangeError(`Raster builder must return Uint8ClampedArray(${byteSize})`);
        }
        if (byteSize > this.namespaceBudgetBytes) {
            throw new RangeError('Generated raster exceeds its namespace budget');
        }

        const pixels = new Uint8ClampedArray(built);
        const canvas = createSurface(width, height);
        get2dContext(canvas).putImageData(new ImageData(pixels, width, height), 0, 0);
        const frame = Object.freeze({ drawable: canvas, durationMs: 0 });
        const resource: VisualResource = Object.freeze({
            key,
            status: 'ready',
            width,
            height,
            logicalWidth: width,
            logicalHeight: height,
            frames: Object.freeze([frame]) as unknown as VisualResource['frames'],
            totalDurationMs: 0,
            animations: Object.freeze({}),
        });
        const entry = { resource, namespace: request.namespace, byteSize };
        this.rasters.set(key, entry);
        this.retainedBytes += byteSize;
        this.namespaceBytes.set(request.namespace, (this.namespaceBytes.get(request.namespace) ?? 0) + byteSize);
        this.evictToBudgets(request.namespace);
        return { resource, cacheHit: false };
    }

    acquireScratch(width: number, height: number): ScratchSurfaceLease {
        const safeWidth = Math.max(1, Math.floor(width));
        const safeHeight = Math.max(1, Math.floor(height));
        const key = `${safeWidth}x${safeHeight}`;
        const available = this.scratch.get(key);
        const canvas = available?.pop() ?? createSurface(safeWidth, safeHeight);
        if (available && !available.length) this.scratch.delete(key);
        if (available) this.scratchReuses += 1;
        else this.scratchAllocations += 1;
        const context = get2dContext(canvas);
        resetContext(context, safeWidth, safeHeight);
        let released = false;
        return {
            canvas,
            context,
            release: () => {
                if (released) return;
                released = true;
                resetContext(context, safeWidth, safeHeight);
                const bucket = this.scratch.get(key) ?? [];
                if (bucket.length < 4) {
                    bucket.push(canvas);
                    this.scratch.set(key, bucket);
                }
            },
        };
    }

    getDiagnostics(): RenderResourceDiagnostics {
        return Object.freeze({
            rasterHits: this.rasterHits,
            rasterMisses: this.rasterMisses,
            rasterEvictions: this.rasterEvictions,
            rasterEntries: this.rasters.size,
            rasterBytes: this.retainedBytes,
            rasterBuildMilliseconds: this.rasterBuildMilliseconds,
            scratchAllocations: this.scratchAllocations,
            scratchReuses: this.scratchReuses,
        });
    }

    clear(): void {
        for (const entry of this.rasters.values()) closeDrawable(entry.resource.frames[0]?.drawable ?? null);
        this.rasters.clear();
        this.namespaceBytes.clear();
        this.scratch.clear();
        this.retainedBytes = 0;
    }

    private evictToBudgets(namespace: string): void {
        while (
            this.rasters.size > 1 &&
            (this.retainedBytes > this.totalBudgetBytes ||
                (this.namespaceBytes.get(namespace) ?? 0) > this.namespaceBudgetBytes)
        ) {
            const namespaceOverBudget = (this.namespaceBytes.get(namespace) ?? 0) > this.namespaceBudgetBytes;
            const oldestKey = namespaceOverBudget
                ? [...this.rasters].find(([, entry]) => entry.namespace === namespace)?.[0]
                : (this.rasters.keys().next().value as string | undefined);
            if (!oldestKey) break;
            const oldest = this.rasters.get(oldestKey);
            this.rasters.delete(oldestKey);
            if (!oldest) continue;
            this.retainedBytes -= oldest.byteSize;
            const remaining = (this.namespaceBytes.get(oldest.namespace) ?? 0) - oldest.byteSize;
            if (remaining > 0) this.namespaceBytes.set(oldest.namespace, remaining);
            else this.namespaceBytes.delete(oldest.namespace);
            closeDrawable(oldest.resource.frames[0]?.drawable ?? null);
            this.rasterEvictions += 1;
        }
    }
}

export const renderResourceManager = new RenderResourceManager();
