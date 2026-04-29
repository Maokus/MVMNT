/**
 * VisualResourceCache — loads, decodes, and caches VisualResource objects.
 *
 * Takes a VisualSourceDescriptor and dispatches to the appropriate decoder:
 *   'image'      → plain image or animated GIF
 *   'grid-atlas' → uniform-grid spritesheet
 *   'sparrow'    → Sparrow v2 XML atlas
 *
 * Multiple handles referencing the same descriptor share a single VisualResource
 * via reference counting (retain/release). Assets are evicted when their count
 * drops to zero; ImageBitmaps are closed on eviction to free GPU memory.
 *
 * All frame drawables are prepared eagerly before status reaches 'ready', so
 * VisualMedia can draw with ctx.drawImage() directly at render time.
 */

// @ts-ignore — gifuct-js lacks bundled types
import { decompressFrames, parseGIF } from 'gifuct-js';
import { type VisualResource, type VisualFrame, type VisualAnimation } from './visual-resource';
import { type VisualSourceDescriptor, type ImageSource, type SparrowAnimationOverride, makeDescriptorKey } from './visual-source-descriptor';

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
    private readonly _resources = new Map<string, VisualResource>();
    private readonly _pending = new Map<string, Promise<VisualResource>>();
    private readonly _refCounts = new Map<string, number>();
    /**
     * Per-key load generation. Incremented whenever a new decode is started or
     * a key is evicted while loading. The in-flight async task captures the
     * generation at start time and discards its result if the generation no longer
     * matches when it finishes — preventing stale writes from superseded loads.
     */
    private readonly _loadGeneration = new Map<string, number>();

    /** Load (or retrieve from cache) a VisualResource for the given descriptor. */
    load(descriptor: VisualSourceDescriptor): Promise<VisualResource> {
        const key = makeDescriptorKey(descriptor);

        const existing = this._resources.get(key);
        if (existing && existing.status === 'ready') return Promise.resolve(existing);

        const inflight = this._pending.get(key);
        if (inflight) return inflight;

        // Bump the generation for this key so any previously orphaned in-flight
        // decode (left over from a release-while-loading scenario) will discard.
        const gen = (this._loadGeneration.get(key) ?? 0) + 1;
        this._loadGeneration.set(key, gen);

        const placeholder: VisualResource = {
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
                    case 'grid-atlas':
                        await this._loadAtlas(placeholder, descriptor.src, descriptor.layout);
                        break;
                    case 'sparrow':
                        await this._loadSparrow(
                            placeholder,
                            descriptor.imageSrc,
                            descriptor.xmlSrc,
                            descriptor.defaultFps ?? 24,
                            descriptor.animations
                        );
                        break;
                }
                placeholder.status = 'ready';
            } catch (err) {
                placeholder.status = 'error';
                placeholder.errorMessage = err instanceof Error ? err.message : String(err);
            } finally {
                this._pending.delete(key);
                // If the generation changed while we were loading, this decode was
                // superseded (the key was evicted and/or reloaded). Discard and clean up.
                if (this._loadGeneration.get(key) !== gen) {
                    this._closeDrawables(placeholder);
                    if (this._resources.get(key) === placeholder) {
                        this._resources.delete(key);
                    }
                }
            }
            return placeholder;
        })();

        this._pending.set(key, p);
        return p;
    }

    private async _loadImage(out: VisualResource, src: ImageSource): Promise<void> {
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
        out: VisualResource,
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
        out: VisualResource,
        imageSrc: ImageSource,
        xmlSrc: ImageSource,
        defaultFps: number,
        animationOverrides?: Record<string, SparrowAnimationOverride>
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
        const animGroups: { prefix: string; startFrameIndex: number }[] = [];
        const frameLogicalWidths: number[] = [];
        const frameLogicalHeights: number[] = [];

        // Group consecutive frames into animations by their name prefix (the part
        // before any trailing digits). A new group starts whenever the prefix changes,
        // matching the order frames appear in the XML. The regex requires at least one
        // non-digit character before the trailing run of digits so that purely-numeric
        // names (unusual but valid) are treated as their own single-frame animation.
        let currentPrefix: string | null = null;

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

            // Strip trailing digits only when preceded by at least one non-digit.
            // "idle dance0001" → "idle dance", "0001" → "0001" (no match, full name).
            const m = name.match(/^(.*\D)(\d+)$/);
            const prefix = m ? m[1] : name;

            if (prefix !== currentPrefix) {
                currentPrefix = prefix;
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

        // Apply per-animation overrides from the descriptor.
        // fps overrides create new VisualFrame objects (rather than mutating shared
        // frames in out.frames) to keep the resource's flat frame list consistent.
        if (animationOverrides) {
            for (const [name, override] of Object.entries(animationOverrides)) {
                const anim = animations[name];
                if (!anim) continue;
                if (override.loopMode !== undefined) {
                    anim.loopMode = override.loopMode;
                }
                if (override.fps !== undefined && override.fps !== anim.fps) {
                    const newFrameDur = 1000 / override.fps;
                    anim.frames = anim.frames.map((f) => ({ ...f, durationMs: newFrameDur }));
                    anim.fps = override.fps;
                    anim.totalDurationMs = anim.frames.length * newFrameDur;
                }
            }
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
    get(key: string): VisualResource | undefined {
        return this._resources.get(key);
    }

    /** Increment the reference count for a resource key. */
    retain(key: string): void {
        this._refCounts.set(key, (this._refCounts.get(key) ?? 0) + 1);
    }

    /**
     * Decrement the reference count. Evicts the resource when count reaches zero,
     * closing any ImageBitmaps to release GPU memory.
     *
     * If the resource is still loading when evicted, the in-flight decode is
     * invalidated via the generation counter — its result will be discarded when
     * it eventually completes.
     */
    release(key: string): void {
        const count = (this._refCounts.get(key) ?? 0) - 1;
        if (count <= 0) {
            this._refCounts.delete(key);
            const resource = this._resources.get(key);
            if (resource) {
                if (resource.status === 'loading') {
                    // Invalidate the in-flight decode — it will discard its result.
                    this._loadGeneration.set(key, (this._loadGeneration.get(key) ?? 0) + 1);
                } else {
                    this._closeDrawables(resource);
                }
            }
            this._resources.delete(key);
            this._pending.delete(key);
        } else {
            this._refCounts.set(key, count);
        }
    }

    clearAll(): void {
        for (const resource of this._resources.values()) {
            this._closeDrawables(resource);
        }
        this._resources.clear();
        this._pending.clear();
        this._refCounts.clear();
        this._loadGeneration.clear();
    }

    /** Close all ImageBitmaps held by a resource to free GPU/decoder memory. */
    private _closeDrawables(resource: VisualResource): void {
        const closed = new Set<CanvasImageSource>();
        for (const frame of resource.frames) {
            if (frame.drawable && !closed.has(frame.drawable)) {
                closed.add(frame.drawable);
                if (frame.drawable instanceof ImageBitmap) {
                    frame.drawable.close();
                }
            }
        }
    }
}

export const visualResourceCache = new VisualResourceCache();
