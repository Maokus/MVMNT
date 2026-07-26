import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderResourceManager } from '../render-resource-manager';

class MockImageData {
    constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
    ) {}
}

class MockContext {
    putImageData = vi.fn();
    setTransform = vi.fn();
    clearRect = vi.fn();
    globalAlpha = 1;
    globalCompositeOperation = 'source-over';
    filter = 'none';
    imageSmoothingEnabled = true;
}

class MockCanvas {
    readonly context = new MockContext();
    constructor(
        readonly width: number,
        readonly height: number
    ) {}
    getContext() {
        return this.context;
    }
}

describe('RenderResourceManager', () => {
    beforeEach(() => {
        vi.stubGlobal('ImageData', MockImageData);
        vi.stubGlobal('OffscreenCanvas', MockCanvas);
    });

    it('runs immutable raster builders only on a content-addressed miss', () => {
        const manager = new RenderResourceManager(1024, 1024);
        const build = vi.fn(() => new Uint8ClampedArray(16).fill(7));
        const request = {
            namespace: 'plugin:a',
            contentKey: 'revision:1',
            width: 2,
            height: 2,
            format: 'rgba8' as const,
            build,
        };

        const cold = manager.generatedRaster(request);
        const warm = manager.generatedRaster(request);

        expect(cold.cacheHit).toBe(false);
        expect(warm.cacheHit).toBe(true);
        expect(warm.resource).toBe(cold.resource);
        expect(build).toHaveBeenCalledTimes(1);
        expect(manager.getDiagnostics()).toMatchObject({
            rasterHits: 1,
            rasterMisses: 1,
            rasterEntries: 1,
            rasterBytes: 16,
        });
    });

    it('namespaces plugin keys and enforces exact RGBA output', () => {
        const manager = new RenderResourceManager(1024, 1024);
        const request = {
            contentKey: 'same',
            width: 1,
            height: 1,
            format: 'rgba8' as const,
            build: () => new Uint8ClampedArray(4),
        };
        const a = manager.generatedRaster({ ...request, namespace: 'plugin:a' });
        const b = manager.generatedRaster({ ...request, namespace: 'plugin:b' });

        expect(a.resource).not.toBe(b.resource);
        expect(() =>
            manager.generatedRaster({
                ...request,
                namespace: 'plugin:c',
                build: () => new Uint8ClampedArray(3),
            })
        ).toThrow(/Uint8ClampedArray\(4\)/);
    });

    it('leases distinct nested scratch surfaces and reuses released surfaces', () => {
        const manager = new RenderResourceManager();
        const first = manager.acquireScratch(100, 50);
        const nested = manager.acquireScratch(100, 50);
        expect(nested.canvas).not.toBe(first.canvas);
        first.release();
        nested.release();

        const reused = manager.acquireScratch(100, 50);
        expect([first.canvas, nested.canvas]).toContain(reused.canvas);
        expect(manager.getDiagnostics()).toMatchObject({
            scratchAllocations: 2,
            scratchReuses: 1,
        });
    });
});
