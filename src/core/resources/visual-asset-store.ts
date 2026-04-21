/**
 * VisualAssetStore — loads, decodes, and caches VisualAsset objects.
 *
 * Wraps the existing ImageLoader so all GIF-decoding and image-loading logic
 * stays in one place. Multiple scene elements that reference the same source
 * share a single VisualAsset with pre-prepared frame drawables.
 *
 * All frame drawables (ImageBitmap preferred, fallback canvas) are created
 * eagerly before status is set to 'ready', so VisualMedia can draw directly
 * with no render-time conversion work.
 */
import { imageLoader } from './image-loader';
import { VisualAsset, VisualFrame } from './visual-asset';

type ImageSource = string | File;

const makeKey = (src: ImageSource): string => {
    if (typeof src === 'string') return src;
    return `file:${src.name}:${src.size}:${src.lastModified}`;
};

/** Convert raw ImageData to a CanvasImageSource, once, at load time. */
async function prepareDrawable(imageData: ImageData): Promise<CanvasImageSource> {
    if ('createImageBitmap' in window) {
        try {
            return await createImageBitmap(imageData);
        } catch {}
    }
    // Fallback: pre-bake into a reusable canvas element
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(imageData, 0, 0);
    return canvas;
}

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
            logicalWidth: 0,
            logicalHeight: 0,
            pivot: { x: 0, y: 0 },
            imageElement: null,
            isAnimated: imageLoader.isGIF(src),
            frames: [],
            totalDurationMs: 0,
            clips: {},
        };
        this._assets.set(key, placeholder);

        const p = (async () => {
            try {
                if (imageLoader.isGIF(src)) {
                    const gif = await imageLoader.loadGIF(src);
                    placeholder.width = gif.width;
                    placeholder.height = gif.height;
                    placeholder.logicalWidth = gif.width;
                    placeholder.logicalHeight = gif.height;
                    placeholder.totalDurationMs = gif.totalDurationMs;
                    placeholder.isAnimated = true;
                    // Prepare all drawables before marking ready — no render-time conversion
                    const drawables = await Promise.all(gif.frames.map((f) => prepareDrawable(f.image)));
                    placeholder.frames = gif.frames.map<VisualFrame>((f, i) => ({
                        drawable: drawables[i],
                        durationMs: f.delay,
                    }));
                } else {
                    const img = await imageLoader.loadImage(src);
                    placeholder.imageElement = img;
                    placeholder.width = img.naturalWidth || img.width;
                    placeholder.height = img.naturalHeight || img.height;
                    placeholder.logicalWidth = placeholder.width;
                    placeholder.logicalHeight = placeholder.height;
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
