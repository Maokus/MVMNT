// Centralized image (bitmap + GIF) loading & caching service
// Keeps render objects deterministic & lightweight.
// Handles: File -> dataURL conversion, de-duped async loads, GIF decoding, error isolation.
// Emits 'imageLoaded' CustomEvent for existing invalidation logic in visualizer-core.

// @ts-ignore - gifuct-js lacks bundled types
import { decompressFrames, parseGIF } from 'gifuct-js';

export interface LoadedGIFFrame {
    image: ImageData;
    delay: number; // ms
}

export interface LoadedGIF {
    frames: LoadedGIFFrame[];
    width: number;
    height: number;
    totalDurationMs: number;
}

type ImageLike = HTMLImageElement;

type ImageSource = string | File;

interface PendingEntry<T> {
    promise: Promise<T>;
    started: number;
}

const makeKey = (src: ImageSource, kind: 'img' | 'gif'): string => {
    if (typeof src === 'string') return `${kind}|${src}`;
    return `${kind}|file:${src.name}:${src.size}:${src.lastModified}`;
};

export class ImageLoader {
    private imageCache = new Map<string, ImageLike>();
    private gifCache = new Map<string, LoadedGIF>();
    private pendingImages = new Map<string, PendingEntry<ImageLike>>();
    private pendingGIFs = new Map<string, PendingEntry<LoadedGIF>>();

    /** Load (and cache) a regular raster image. */
    loadImage(src: ImageSource): Promise<ImageLike> {
        const key = makeKey(src, 'img');
        if (this.imageCache.has(key)) return Promise.resolve(this.imageCache.get(key)!);
        if (this.pendingImages.has(key)) return this.pendingImages.get(key)!.promise;

        const p = (async () => {
            const url = await this.resolveToURL(src);
            return new Promise<ImageLike>((resolve, reject) => {
                const img = document.createElement('img');
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    this.imageCache.set(key, img);
                    this.pendingImages.delete(key);
                    try {
                        document?.dispatchEvent?.(
                            new CustomEvent('imageLoaded', {
                                detail: { imageSource: typeof src === 'string' ? src : url },
                            })
                        );
                    } catch {}
                    resolve(img);
                };
                img.onerror = (e) => {
                    this.pendingImages.delete(key);
                    reject(e);
                };
                img.src = url;
            });
        })();
        this.pendingImages.set(key, { promise: p, started: performance.now() });
        return p;
    }

    /** Load & decode a GIF into frames (cached). */
    loadGIF(src: ImageSource): Promise<LoadedGIF> {
        const key = makeKey(src, 'gif');
        if (this.gifCache.has(key)) return Promise.resolve(this.gifCache.get(key)!);
        if (this.pendingGIFs.has(key)) return this.pendingGIFs.get(key)!.promise;

        const p = (async () => {
            try {
                const buffer = await this.resolveToArrayBuffer(src);
                const gif: any = parseGIF(buffer);
                const frames: any[] = decompressFrames(gif, true) as any[];
                const mapped: LoadedGIFFrame[] = frames.map((f: any) => ({
                    image: f.patch as ImageData,
                    delay: typeof f.delay === 'number' && f.delay > 0 ? f.delay : 10,
                }));
                const width = mapped[0]?.image?.width || 0;
                const height = mapped[0]?.image?.height || 0;
                const totalDurationMs = mapped.reduce((acc, fr) => acc + fr.delay, 0) || 1;
                const payload: LoadedGIF = { frames: mapped, width, height, totalDurationMs };
                this.gifCache.set(key, payload);
                this.pendingGIFs.delete(key);
                try {
                    document?.dispatchEvent?.(
                        new CustomEvent('imageLoaded', {
                            detail: { imageSource: typeof src === 'string' ? src : key, type: 'gif' },
                        })
                    );
                } catch {}
                return payload;
            } catch (e) {
                this.pendingGIFs.delete(key);
                throw e;
            }
        })();
        this.pendingGIFs.set(key, { promise: p, started: performance.now() });
        return p;
    }

    /** Determine if source looks like a GIF */
    isGIF(src: ImageSource): boolean {
        if (typeof src === 'string') {
            if (src.startsWith('data:image/gif')) return true;
            return /\.gif($|\?)/i.test(src);
        }
        return /\.gif$/i.test(src.name);
    }

    /** Convert File or string to fetchable URL; keep data URLs unchanged. */
    private async resolveToURL(src: ImageSource): Promise<string> {
        if (typeof src === 'string') return src;
        // For files we prefer data URL so it persists after File object is GC'd
        return this.fileToDataURL(src);
    }

    private async resolveToArrayBuffer(src: ImageSource): Promise<ArrayBuffer> {
        if (typeof src === 'string') {
            if (src.startsWith('data:')) return this.dataURLToArrayBuffer(src);
            const res = await fetch(src);
            return res.arrayBuffer();
        }
        return src.arrayBuffer();
    }

    private fileToDataURL(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    private dataURLToArrayBuffer(dataURL: string): ArrayBuffer {
        const base64 = dataURL.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    getCachedImage(src: ImageSource): ImageLike | undefined {
        return this.imageCache.get(makeKey(src, 'img'));
    }
    getCachedGIF(src: ImageSource): LoadedGIF | undefined {
        return this.gifCache.get(makeKey(src, 'gif'));
    }

    /** Optional: clear caches (e.g. on scene reset) */
    clearAll() {
        this.imageCache.clear();
        this.gifCache.clear();
        this.pendingImages.clear();
        this.pendingGIFs.clear();
    }
}

export const imageLoader = new ImageLoader();
