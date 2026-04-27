/**
 * VisualAssetStore — loads, decodes, and caches VisualAsset objects.
 *
 * Multiple scene elements referencing the same source share a single VisualAsset
 * with pre-prepared frame drawables. Reference counting via retain()/release()
 * enables per-element eviction: assets are evicted when no element holds a
 * reference.
 *
 * All frame drawables (ImageBitmap preferred, fallback canvas) are created
 * eagerly before status is set to 'ready', so VisualMedia can draw directly
 * with no render-time conversion work.
 */

// @ts-ignore - gifuct-js lacks bundled types
import { decompressFrames, parseGIF } from 'gifuct-js';
import { VisualAsset, VisualFrame, AtlasLayout } from './visual-asset';

export type ImageSource = string | File;

/** Base source key (interpretation-agnostic). Used internally only. */
const makeSrcKey = (src: ImageSource): string => {
    if (typeof src === 'string') return src;
    return `file:${src.name}:${src.size}:${src.lastModified}`;
};

/** Cache key for a plain image or GIF asset. */
export function makeImageKey(src: ImageSource): string {
    return `image:${makeSrcKey(src)}`;
}

/** Cache key for a sprite atlas asset. Encodes the full layout so that
 *  different atlas configurations of the same source are cached separately. */
export function makeAtlasKey(src: ImageSource, layout: AtlasLayout): string {
    const c = layout.columns;
    const r = layout.rows;
    const n = layout.frameCount ?? c * r;
    const d = (layout.frameDurationMs ?? 1000 / 12).toFixed(2);
    return `atlas:${makeSrcKey(src)}:cols=${c}:rows=${r}:count=${n}:dur=${d}`;
}

/** Cache key for a Sparrow atlas asset (paired PNG + XML). */
export function makeSparrowKey(imageSrc: ImageSource, xmlSrc: ImageSource): string {
    return `sparrow:${makeSrcKey(imageSrc)}:xml=${makeSrcKey(xmlSrc)}`;
}

function isGIF(src: ImageSource): boolean {
    if (typeof src === 'string') {
        if (src.startsWith('data:image/gif')) return true;
        return /\.gif($|\?)/i.test(src);
    }
    return /\.gif$/i.test(src.name);
}

async function resolveToURL(src: ImageSource): Promise<string> {
    if (typeof src === 'string') return src;
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(src);
    });
}

async function resolveToText(src: ImageSource): Promise<string> {
    if (typeof src === 'string') {
        if (src.startsWith('data:')) return decodeURIComponent(src.split(',')[1] ?? '');
        return (await fetch(src)).text();
    }
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(src);
    });
}

async function resolveToArrayBuffer(src: ImageSource): Promise<ArrayBuffer> {
    if (typeof src === 'string') {
        if (src.startsWith('data:')) {
            const base64 = src.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes.buffer;
        }
        return (await fetch(src)).arrayBuffer();
    }
    return src.arrayBuffer();
}

async function loadRawImage(src: ImageSource): Promise<HTMLImageElement> {
    const url = await resolveToURL(src);
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

interface RawGIFFrame {
    image: ImageData;
    delay: number;
}

interface RawGIF {
    frames: RawGIFFrame[];
    width: number;
    height: number;
    totalDurationMs: number;
}

async function loadRawGIF(src: ImageSource): Promise<RawGIF> {
    const buffer = await resolveToArrayBuffer(src);
    const gif: any = parseGIF(buffer);
    const rawFrames: any[] = decompressFrames(gif, true) as any[];

    const width: number = gif?.lsd?.width || 0;
    const height: number = gif?.lsd?.height || 0;
    const frameCount = rawFrames.length;
    const empty = new Uint8ClampedArray(width * height * 4);
    let previous = empty;
    const composed: RawGIFFrame[] = new Array(frameCount);

    for (let i = 0; i < frameCount; i++) {
        const rf: any = rawFrames[i];
        const { patch, dims, delay } = rf;
        let base = new Uint8ClampedArray(previous);

        if (i > 0 && rawFrames[i - 1].disposalType === 2) {
            const pd = rawFrames[i - 1].dims;
            for (let y = 0; y < pd.height; y++) {
                let di = ((pd.top + y) * width + pd.left) * 4;
                for (let x = 0; x < pd.width; x++, di += 4) {
                    base[di] = base[di + 1] = base[di + 2] = base[di + 3] = 0;
                }
            }
        }

        if (patch && dims) {
            const pw = dims.width;
            const ph = dims.height;
            for (let y = 0; y < ph; y++) {
                let si = y * pw * 4;
                let di = ((dims.top + y) * width + dims.left) * 4;
                for (let x = 0; x < pw; x++, si += 4, di += 4) {
                    base[di] = patch[si];
                    base[di + 1] = patch[si + 1];
                    base[di + 2] = patch[si + 2];
                    base[di + 3] = patch[si + 3];
                }
            }
        }

        composed[i] = {
            image: new ImageData(base, width, height),
            delay: typeof delay === 'number' && delay > 0 ? delay : 10,
        };
        previous = base;
    }

    const totalDurationMs = composed.reduce((acc, fr) => acc + fr.delay, 0) || 1;
    return { frames: composed, width, height, totalDurationMs };
}

/** Convert raw ImageData to a CanvasImageSource once, at load time. */
async function prepareDrawable(imageData: ImageData): Promise<CanvasImageSource> {
    if ('createImageBitmap' in window) {
        try {
            return await createImageBitmap(imageData);
        } catch {}
    }
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
    private readonly _refCounts = new Map<string, number>();

    /** Load (or retrieve from cache) a VisualAsset for the given source. */
    load(src: ImageSource): Promise<VisualAsset> {
        const key = makeImageKey(src);

        const existing = this._assets.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        const placeholder: VisualAsset = {
            key,
            status: 'loading',
            width: 0,
            height: 0,
            logicalWidth: 0,
            logicalHeight: 0,
            pivot: { x: 0, y: 0 },
            imageElement: null,
            isAnimated: isGIF(src),
            frames: [],
            totalDurationMs: 0,
            clips: {},
        };
        this._assets.set(key, placeholder);

        const p = (async () => {
            try {
                if (isGIF(src)) {
                    const gif = await loadRawGIF(src);
                    placeholder.width = gif.width;
                    placeholder.height = gif.height;
                    placeholder.logicalWidth = gif.width;
                    placeholder.logicalHeight = gif.height;
                    placeholder.totalDurationMs = gif.totalDurationMs;
                    placeholder.isAnimated = true;
                    const drawables = await Promise.all(gif.frames.map((f) => prepareDrawable(f.image)));
                    placeholder.frames = gif.frames.map<VisualFrame>((f, i) => ({
                        drawable: drawables[i],
                        durationMs: f.delay,
                    }));
                } else {
                    const img = await loadRawImage(src);
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

    /**
     * Load a static image as a sprite atlas, generating animated frames from a
     * uniform grid layout. Call instead of load() when the source is a spritesheet.
     *
     * logicalWidth/logicalHeight on the resulting asset reflect the per-frame size,
     * not the full texture dimensions, so layout and pivot calculations are correct.
     */
    loadAtlas(src: ImageSource, layout: AtlasLayout): Promise<VisualAsset> {
        const { columns, rows, frameCount: maxFrames, frameDurationMs = 1000 / 12 } = layout;
        const key = makeAtlasKey(src, layout);

        const existing = this._assets.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        const placeholder: VisualAsset = {
            key,
            status: 'loading',
            width: 0,
            height: 0,
            logicalWidth: 0,
            logicalHeight: 0,
            pivot: { x: 0, y: 0 },
            imageElement: null,
            isAnimated: true,
            frames: [],
            totalDurationMs: 0,
            clips: {},
        };
        this._assets.set(key, placeholder);

        const p = (async () => {
            try {
                const img = await loadRawImage(src);
                const textureW = img.naturalWidth || img.width;
                const textureH = img.naturalHeight || img.height;
                const frameW = Math.floor(textureW / columns);
                const frameH = Math.floor(textureH / rows);
                const totalCells = columns * rows;
                const frameCount = maxFrames != null ? Math.min(maxFrames, totalCells) : totalCells;

                // Keep the full atlas as a single bitmap — each frame references it
                // with a sourceRect so VisualMedia can use the 9-argument drawImage form.
                let atlasBitmap: CanvasImageSource = img;
                if ('createImageBitmap' in window) {
                    try {
                        atlasBitmap = await createImageBitmap(img);
                    } catch {}
                }

                placeholder.width = textureW;
                placeholder.height = textureH;
                placeholder.logicalWidth = frameW;
                placeholder.logicalHeight = frameH;
                placeholder.totalDurationMs = frameCount * frameDurationMs;
                placeholder.frames = [];
                for (let i = 0; i < frameCount; i++) {
                    const col = i % columns;
                    const row = Math.floor(i / columns);
                    placeholder.frames.push({
                        drawable: atlasBitmap,
                        durationMs: frameDurationMs,
                        sourceRect: { sx: col * frameW, sy: row * frameH, sw: frameW, sh: frameH },
                    });
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

    /**
     * Load a Sparrow v2 texture atlas (PNG + XML file pair) as an animated asset.
     * Frames are parsed from the XML, grouped into named clips by animation prefix,
     * and stored with per-frame trim offset and logical-size metadata for correct rendering.
     *
     * @param defaultFps  Playback speed applied to all frames (default 24 fps).
     *                    Per-animation FPS can later be applied by setting per-frame durationMs.
     */
    loadSparrow(imageSrc: ImageSource, xmlSrc: ImageSource, defaultFps: number = 24): Promise<VisualAsset> {
        const key = makeSparrowKey(imageSrc, xmlSrc);

        const existing = this._assets.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        const placeholder: VisualAsset = {
            key,
            status: 'loading',
            width: 0,
            height: 0,
            logicalWidth: 0,
            logicalHeight: 0,
            pivot: { x: 0, y: 0 },
            imageElement: null,
            isAnimated: true,
            frames: [],
            totalDurationMs: 0,
            clips: {},
        };
        this._assets.set(key, placeholder);

        const p = (async () => {
            try {
                const [img, xmlText] = await Promise.all([
                    loadRawImage(imageSrc),
                    resolveToText(xmlSrc),
                ]);

                const textureW = img.naturalWidth || img.width;
                const textureH = img.naturalHeight || img.height;
                const frameDurationMs = 1000 / defaultFps;

                let atlasBitmap: CanvasImageSource = img;
                if ('createImageBitmap' in window) {
                    try { atlasBitmap = await createImageBitmap(img); } catch {}
                }

                const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
                const subTextures = Array.from(doc.querySelectorAll('SubTexture'));

                const frames: VisualFrame[] = [];
                type AnimGroup = { prefix: string; startFrameIndex: number };
                const animGroups: AnimGroup[] = [];
                const seenPrefixes = new Map<string, number>();
                const frameLogicalWidths: number[] = [];
                const frameLogicalHeights: number[] = [];

                for (const st of subTextures) {
                    const name = st.getAttribute('name') ?? '';
                    const x = parseInt(st.getAttribute('x') ?? '0', 10);
                    const y = parseInt(st.getAttribute('y') ?? '0', 10);
                    const w = parseInt(st.getAttribute('width') ?? '0', 10);
                    const h = parseInt(st.getAttribute('height') ?? '0', 10);
                    const frameX = parseInt(st.getAttribute('frameX') ?? '0', 10);
                    const frameY = parseInt(st.getAttribute('frameY') ?? '0', 10);
                    const frameW = parseInt(st.getAttribute('frameWidth') ?? st.getAttribute('width') ?? '0', 10);
                    const frameH = parseInt(st.getAttribute('frameHeight') ?? st.getAttribute('height') ?? '0', 10);
                    const rotated = st.getAttribute('rotated') === 'true';

                    // Group frames by animation prefix (name with trailing digits stripped).
                    const prefix = name.replace(/\d+$/, '');
                    if (!seenPrefixes.has(prefix)) {
                        seenPrefixes.set(prefix, animGroups.length);
                        animGroups.push({ prefix, startFrameIndex: frames.length });
                    }

                    frames.push({
                        drawable: atlasBitmap,
                        durationMs: frameDurationMs,
                        sourceRect: { sx: x, sy: y, sw: w, sh: h },
                        trimOffset: { x: -frameX, y: -frameY },
                        logicalSize: { w: frameW, h: frameH },
                        rotated,
                    });
                    frameLogicalWidths.push(frameW);
                    frameLogicalHeights.push(frameH);
                }

                // Build clips: each animation prefix → {startMs, endMs}.
                const clips: Record<string, import('./visual-asset').VisualClip> = {};
                let accMs = 0;
                for (let gi = 0; gi < animGroups.length; gi++) {
                    const group = animGroups[gi];
                    const endIdx = gi + 1 < animGroups.length
                        ? animGroups[gi + 1].startFrameIndex
                        : frames.length;
                    const groupDurationMs = (endIdx - group.startFrameIndex) * frameDurationMs;
                    clips[group.prefix] = { name: group.prefix, startMs: accMs, endMs: accMs + groupDurationMs };
                    accMs += groupDurationMs;
                }

                // Use median logical frame size for asset-level layout calculations.
                const sortedW = [...frameLogicalWidths].sort((a, b) => a - b);
                const sortedH = [...frameLogicalHeights].sort((a, b) => a - b);
                const mid = Math.floor(sortedW.length / 2);

                placeholder.width = textureW;
                placeholder.height = textureH;
                placeholder.logicalWidth = sortedW[mid] ?? 0;
                placeholder.logicalHeight = sortedH[mid] ?? 0;
                placeholder.frames = frames;
                placeholder.totalDurationMs = frames.length * frameDurationMs;
                placeholder.clips = clips;
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

    /** Synchronously retrieve an asset by its full cache key (may be in any status including 'loading'). */
    get(key: string): VisualAsset | undefined {
        return this._assets.get(key);
    }

    /** Increment the reference count for an asset key. */
    retain(key: string): void {
        this._refCounts.set(key, (this._refCounts.get(key) ?? 0) + 1);
    }

    /**
     * Decrement the reference count for an asset.
     * Evicts the asset from the cache when the count reaches zero.
     */
    release(key: string): void {
        const count = (this._refCounts.get(key) ?? 0) - 1;
        if (count <= 0) {
            this._refCounts.delete(key);
            this._assets.delete(key);
            this._pending.delete(key);
        } else {
            this._refCounts.set(key, count);
        }
    }

    clearAll() {
        this._assets.clear();
        this._pending.clear();
        this._refCounts.clear();
    }
}

export const visualAssetStore = new VisualAssetStore();
