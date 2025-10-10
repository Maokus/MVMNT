import type { WebGLContext } from './buffers';

export interface TextureResourceDiagnostics {
    textureCount: number;
    textureBytes: number;
}

export interface TextureHandle {
    texture: WebGLTexture;
    width: number;
    height: number;
    bytes: number;
    dirty: boolean;
}

export class TextureCache {
    private readonly imageTextures = new WeakMap<CanvasImageSource, TextureHandle>();
    private readonly imageHandles = new Set<TextureHandle>();
    private readonly atlasTextures = new Map<string, TextureHandle>();
    private bytesAllocated = 0;

    constructor(private readonly gl: WebGLContext) {}

    resolveImageTexture(source: CanvasImageSource): TextureHandle {
        let handle = this.imageTextures.get(source);
        if (handle) return handle;
        handle = this.createTexture();
        this.imageTextures.set(source, handle);
        this.imageHandles.add(handle);
        return handle;
    }

    resolveAtlasTexture(id: string): TextureHandle {
        const existing = this.atlasTextures.get(id);
        if (existing) return existing;
        const handle = this.createTexture();
        this.atlasTextures.set(id, handle);
        return handle;
    }

    uploadImage(handle: TextureHandle, image: CanvasImageSource): void {
        const { gl } = this;
        gl.bindTexture(gl.TEXTURE_2D, handle.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image as any);
        const width = (image as { width?: number }).width ?? (image as { videoWidth?: number }).videoWidth ?? 0;
        const height =
            (image as { height?: number }).height ?? (image as { videoHeight?: number }).videoHeight ?? 0;
        this.updateHandleSize(handle, width, height);
        handle.dirty = false;
    }

    uploadAtlasData(
        handle: TextureHandle,
        width: number,
        height: number,
        data: Uint8ClampedArray | Uint8Array | CanvasImageSource
    ): void {
        const { gl } = this;
        gl.bindTexture(gl.TEXTURE_2D, handle.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, width, height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, data);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data as any);
        }
        this.updateHandleSize(handle, width, height);
        handle.dirty = false;
    }

    markDirty(handle: TextureHandle): void {
        handle.dirty = true;
    }

    dispose(): void {
        for (const handle of this.imageHandles) {
            this.disposeHandle(handle);
        }
        for (const handle of this.atlasTextures.values()) {
            this.disposeHandle(handle);
        }
        this.imageHandles.clear();
        this.atlasTextures.clear();
        this.bytesAllocated = 0;
    }

    get diagnostics(): TextureResourceDiagnostics {
        return {
            textureCount: this.imageHandles.size + this.atlasTextures.size,
            textureBytes: this.bytesAllocated,
        };
    }

    private createTexture(): TextureHandle {
        const texture = this.gl.createTexture();
        if (!texture) throw new Error('Unable to create WebGL texture.');
        return { texture, width: 0, height: 0, bytes: 0, dirty: true };
    }

    private updateHandleSize(handle: TextureHandle, width: number, height: number): void {
        const bytes = width * height * 4;
        this.bytesAllocated += bytes - handle.bytes;
        handle.width = width;
        handle.height = height;
        handle.bytes = bytes;
    }

    private disposeHandle(handle: TextureHandle): void {
        this.gl.deleteTexture(handle.texture);
    }
}
