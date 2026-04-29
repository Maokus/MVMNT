/**
 * VisualResourceCache — loads, decodes, and caches DecodedResource objects.
 *
 * Takes a VisualSourceDescriptor and dispatches to the appropriate decoder:
 *   'image'   → plain image or animated GIF
 *   'atlas'   → uniform-grid spritesheet
 *   'sparrow' → Sparrow v2 XML atlas
 *
 * Multiple handles referencing the same descriptor share a single DecodedResource
 * via reference counting (retain/release). Assets are evicted when their count
 * drops to zero.
 *
 * All frame drawables are prepared eagerly before status reaches 'ready', so
 * VisualMedia can draw with ctx.drawImage() directly at render time.
 */

// @ts-ignore — gifuct-js lacks bundled types
import { decompressFrames, parseGIF } from 'gifuct-js';
import { type DecodedResource, type VisualFrame, type VisualAnimation } from './visual-resource';
import { type VisualSourceDescriptor, type ImageSource, makeDescriptorKey } from './visual-source-descriptor';

// ─── Source helpers ──────────────────────────────────────────────────────────

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
        img.onerror = (e) => reject(new Error(`Failed to load image: ${url} (${String(e)})`));
        img.src = url;
    });
}

interface RawGIFFrame {
    image: ImageData;
    delay: number;
}

async function loadRawGIF(src: ImageSource): Promise<{
    frames: RawGIFFrame[];
    width: number;
    height: number;
    totalDurationMs: number;
}> {
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

async function makeImageBitmapFrom(img: HTMLImageElement): Promise<CanvasImageSource> {
    if ('createImageBitmap' in window) {
        try {
            return await createImageBitmap(img);
        } catch {}
    }
    return img;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export class VisualResourceCache {
    private readonly _resources = new Map<string, DecodedResource>();
    private readonly _pending = new Map<string, Promise<DecodedResource>>();
    private readonly _refCounts = new Map<string, number>();

    /** Load (or retrieve from cache) a DecodedResource for the given descriptor. */
    load(descriptor: VisualSourceDescriptor): Promise<DecodedResource> {
        const key = makeDescriptorKey(descriptor);

        const existing = this._resources.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        const placeholder: DecodedResource = {
            key,
            status: 'loading',
            width: 0,
            height: 0,
            logicalWidth: 0,
            logicalHeight: 0,
            frames: [],
            totalDurationMs: 0,
            animations: {},
        };
        this._resources.set(key, placeholder);

        const p = (async () => {
            try {
                switch (descriptor.kind) {
                    case 'image':
                        await this._loadImage(placeholder, descriptor.src);
                        break;
                    case 'atlas':
                        await this._loadAtlas(placeholder, descriptor.src, descriptor.layout);
                        break;
                    case 'sparrow':
                        await this._loadSparrow(
                            placeholder,
                            descriptor.imageSrc,
                            descriptor.xmlSrc,
                            descriptor.defaultFps ?? 24
                        );
                        break;
                }
                placeholder.status = 'ready';
            } catch (err) {
                placeholder.status = 'error';
                placeholder.errorMessage = err instanceof Error ? err.message : String(err);
            } finally {
                this._pending.delete(key);
            }
            return placeholder;
        })();

        this._pending.set(key, p);
        return p;
    }

    private async _loadImage(out: DecodedResource, src: ImageSource): Promise<void> {
        if (isGIF(src)) {
            const gif = await loadRawGIF(src);
            out.width = gif.width;
            out.height = gif.height;
            out.logicalWidth = gif.width;
            out.logicalHeight = gif.height;
            out.totalDurationMs = gif.totalDurationMs;
            const drawables = await Promise.all(gif.frames.map((f) => prepareDrawable(f.image)));
            out.frames = gif.frames.map<VisualFrame>((f, i) => ({
                drawable: drawables[i],
                durationMs: f.delay,
            }));
        } else {
            const img = await loadRawImage(src);
            const bitmap = await makeImageBitmapFrom(img);
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            out.width = w;
            out.height = h;
            out.logicalWidth = w;
            out.logicalHeight = h;
            // Single frame with durationMs=0 — getFrameAtTime returns it unconditionally.
            out.frames = [{ drawable: bitmap, durationMs: 0 }];
            out.totalDurationMs = 0;
        }
    }

    private async _loadAtlas(
        out: DecodedResource,
        src: ImageSource,
        layout: import('./visual-source-descriptor').AtlasLayout
    ): Promise<void> {
        const { columns, rows, frameCount: maxFrames, frameDurationMs = 1000 / 12 } = layout;
        const img = await loadRawImage(src);
        const textureW = img.naturalWidth || img.width;
        const textureH = img.naturalHeight || img.height;
        const frameW = Math.floor(textureW / columns);
        const frameH = Math.floor(textureH / rows);
        const totalCells = columns * rows;
        const frameCount = maxFrames != null ? Math.min(maxFrames, totalCells) : totalCells;

        let atlasBitmap: CanvasImageSource = img;
        if ('createImageBitmap' in window) {
            try {
                atlasBitmap = await createImageBitmap(img);
            } catch {}
        }

        out.width = textureW;
        out.height = textureH;
        out.logicalWidth = frameW;
        out.logicalHeight = frameH;
        out.totalDurationMs = frameCount * frameDurationMs;
        out.frames = [];
        for (let i = 0; i < frameCount; i++) {
            const col = i % columns;
            const row = Math.floor(i / columns);
            out.frames.push({
                drawable: atlasBitmap,
                durationMs: frameDurationMs,
                sourceRect: { sx: col * frameW, sy: row * frameH, sw: frameW, sh: frameH },
            });
        }
    }

    private async _loadSparrow(
        out: DecodedResource,
        imageSrc: ImageSource,
        xmlSrc: ImageSource,
        defaultFps: number
    ): Promise<void> {
        const [img, xmlText] = await Promise.all([loadRawImage(imageSrc), resolveToText(xmlSrc)]);

        const textureW = img.naturalWidth || img.width;
        const textureH = img.naturalHeight || img.height;
        const frameDurationMs = 1000 / defaultFps;

        let atlasBitmap: CanvasImageSource = img;
        if ('createImageBitmap' in window) {
            try {
                atlasBitmap = await createImageBitmap(img);
            } catch {}
        }

        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const subTextures = Array.from(doc.querySelectorAll('SubTexture'));

        const allFrames: VisualFrame[] = [];
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

            const prefix = name.replace(/\d+$/, '');
            if (!seenPrefixes.has(prefix)) {
                seenPrefixes.set(prefix, animGroups.length);
                animGroups.push({ prefix, startFrameIndex: allFrames.length });
            }

            allFrames.push({
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

        // Build named animations — each owns its frame slice directly.
        const animations: Record<string, VisualAnimation> = {};
        for (let gi = 0; gi < animGroups.length; gi++) {
            const group = animGroups[gi];
            const endIdx = gi + 1 < animGroups.length ? animGroups[gi + 1].startFrameIndex : allFrames.length;
            const animFrames = allFrames.slice(group.startFrameIndex, endIdx);
            const animDurationMs = animFrames.length * frameDurationMs;
            animations[group.prefix] = {
                name: group.prefix,
                frames: animFrames,
                fps: defaultFps,
                totalDurationMs: animDurationMs,
                loopMode: 'loop',
            };
        }

        const sortedW = [...frameLogicalWidths].sort((a, b) => a - b);
        const sortedH = [...frameLogicalHeights].sort((a, b) => a - b);
        const mid = Math.floor(sortedW.length / 2);

        out.width = textureW;
        out.height = textureH;
        out.logicalWidth = sortedW[mid] ?? 0;
        out.logicalHeight = sortedH[mid] ?? 0;
        out.frames = allFrames;
        out.totalDurationMs = allFrames.length * frameDurationMs;
        out.animations = animations;
    }

    /** Synchronously retrieve a resource by its cache key. */
    get(key: string): DecodedResource | undefined {
        return this._resources.get(key);
    }

    /** Increment the reference count for a resource key. */
    retain(key: string): void {
        this._refCounts.set(key, (this._refCounts.get(key) ?? 0) + 1);
    }

    /**
     * Decrement the reference count. Evicts the resource when count reaches zero.
     */
    release(key: string): void {
        const count = (this._refCounts.get(key) ?? 0) - 1;
        if (count <= 0) {
            this._refCounts.delete(key);
            this._resources.delete(key);
            this._pending.delete(key);
        } else {
            this._refCounts.set(key, count);
        }
    }

    clearAll(): void {
        this._resources.clear();
        this._pending.clear();
        this._refCounts.clear();
    }
}

export const visualResourceCache = new VisualResourceCache();
