/**
 * VisualAssetStore — loads, decodes, and caches VisualAsset objects.
 *
 * Wraps the existing ImageLoader so all GIF-decoding and image-loading logic
 * stays in one place. Multiple scene elements that reference the same source
 * share a single VisualAsset (and therefore a single set of ImageBitmap frames).
 */
import { imageLoader } from './image-loader';
import { VisualAsset, VisualAssetStatus } from './visual-asset';

type ImageSource = string | File;

const makeKey = (src: ImageSource): string => {
    if (typeof src === 'string') return src;
    return `file:${src.name}:${src.size}:${src.lastModified}`;
};

export class VisualAssetStore {
    private readonly _assets = new Map<string, VisualAsset>();
    private readonly _pending = new Map<string, Promise<VisualAsset>>();

    /** Load (or retrieve from cache) a VisualAsset for the given source. */
    load(src: ImageSource): Promise<VisualAsset> {
        const key = makeKey(src);

        const existing = this._assets.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        // Create a placeholder so callers can use get() immediately with status 'loading'
        const placeholder: VisualAsset = {
            key,
            status: 'loading',
            width: 0,
            height: 0,
            imageElement: null,
            isAnimated: imageLoader.isGIF(src),
            frames: [],
            totalDurationMs: 0,
        };
        this._assets.set(key, placeholder);

        const p = (async () => {
            try {
                if (imageLoader.isGIF(src)) {
                    const gif = await imageLoader.loadGIF(src);
                    placeholder.width = gif.width;
                    placeholder.height = gif.height;
                    placeholder.frames = gif.frames.map((f) => ({
                        imageData: f.image,
                        bitmap: null,
                        durationMs: f.delay,
                    }));
                    placeholder.totalDurationMs = gif.totalDurationMs;
                    placeholder.isAnimated = true;
                } else {
                    const img = await imageLoader.loadImage(src);
                    placeholder.imageElement = img;
                    placeholder.width = img.naturalWidth || img.width;
                    placeholder.height = img.naturalHeight || img.height;
                    placeholder.isAnimated = false;
                }
                placeholder.status = 'ready';
            } catch {
                placeholder.status = 'error';
            } finally {
                this._pending.delete(key);
            }
            return placeholder;
        })();

        this._pending.set(key, p);
        return p;
    }

    /** Synchronously retrieve an asset (may be in any status including 'loading'). */
    get(src: ImageSource): VisualAsset | undefined {
        return this._assets.get(makeKey(src));
    }

    clearAll() {
        this._assets.clear();
        this._pending.clear();
        imageLoader.clearAll();
    }
}

export const visualAssetStore = new VisualAssetStore();
