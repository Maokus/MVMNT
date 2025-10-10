import type { WebGLContext } from './buffers';

const FNV_OFFSET_BASIS = 2166136261 >>> 0;
const FNV_PRIME = 16777619 >>> 0;

function fnv1a(buffer: Uint8Array | Uint8ClampedArray): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < buffer.length; i += 1) {
        hash ^= buffer[i];
        hash = (hash * FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

export interface FrameHashResult {
    hash: string;
    bytesSampled: number;
}

export function hashFrame(
    gl: WebGLContext,
    width: number,
    height: number,
    scratch?: Uint8Array
): FrameHashResult {
    const pixels = scratch ?? new Uint8Array(width * height * 4);
    if (pixels.length < width * height * 4) {
        throw new Error('Frame hash buffer is smaller than the required pixel count.');
    }
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const hash = fnv1a(pixels.subarray(0, width * height * 4)).toString(16).padStart(8, '0');
    return { hash, bytesSampled: width * height * 4 };
}

export function hashPixelBuffer(pixels: Uint8Array | Uint8ClampedArray): FrameHashResult {
    const hash = fnv1a(pixels).toString(16).padStart(8, '0');
    return { hash, bytesSampled: pixels.length };
}

export function hashFromSummary(summary: string): FrameHashResult {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(summary);
    const hash = fnv1a(bytes).toString(16).padStart(8, '0');
    return { hash, bytesSampled: bytes.length };
}
