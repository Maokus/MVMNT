import { GLBuffer, type WebGLContext } from './buffers';
import type { GeometryAttributeLayout, WebGLGeometrySource } from './types';

export class GeometryBatch {
    private readonly buffer: GLBuffer;
    private version = 0;
    private lastData: Float32Array | null = null;
    private geometry: WebGLGeometrySource;

    constructor(private readonly gl: WebGLContext, geometry: WebGLGeometrySource) {
        this.buffer = new GLBuffer(gl, gl.ARRAY_BUFFER);
        this.geometry = geometry;
    }

    bind(): void {
        this.buffer.bind();
    }

    ensureUploaded(): void {
        if (
            this.geometry.data !== this.lastData ||
            this.geometry.data.byteLength !== this.buffer.byteLength ||
            this.version === 0
        ) {
            this.buffer.upload(this.geometry.data, this.gl.STATIC_DRAW);
            this.lastData = this.geometry.data;
            this.version += 1;
        }
    }

    configureAttributes(attributeBinder: (layout: GeometryAttributeLayout) => void): void {
        for (const layout of this.geometry.attributes) {
            attributeBinder(layout);
        }
    }

    updateSource(source: WebGLGeometrySource): void {
        if (this.geometry === source) return;
        this.geometry = source;
        this.lastData = null;
        this.version = 0;
    }

    dispose(): void {
        this.buffer.dispose();
        this.lastData = null;
        this.version = 0;
    }
}

export class GeometryBatchCache {
    private readonly batches = new Map<string, GeometryBatch>();

    constructor(private readonly gl: WebGLContext) {}

    resolve(source: WebGLGeometrySource): GeometryBatch {
        const existing = this.batches.get(source.id);
        if (existing) {
            existing.updateSource(source);
            return existing;
        }
        const batch = new GeometryBatch(this.gl, source);
        this.batches.set(source.id, batch);
        return batch;
    }

    dispose(): void {
        for (const batch of this.batches.values()) {
            batch.dispose();
        }
        this.batches.clear();
    }
}
