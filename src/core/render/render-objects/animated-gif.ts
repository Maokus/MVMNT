import { RenderObject, RenderConfig, Bounds } from './base';
import { imageLoader, LoadedGIFFrame, LoadedGIF } from '@core/resources/image-loader';

interface GIFFrame extends LoadedGIFFrame {}

/**
 * AnimatedGif render object
 * - Decodes GIF frames once (lazy) using centralized imageLoader
 * - Renders current frame based on elapsed time * playbackSpeed
 */
export class AnimatedGif extends RenderObject {
    width: number;
    height: number;
    source: string | null; // data URL or URL
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio: boolean;
    playbackSpeed: number; // multiplier (1 = normal)

    private _frames: GIFFrame[] | null = null;
    private _totalDurationMs = 0;
    private _decodeStarted = false;
    private _decodeError: any = null;
    private _lastFrameIndex = -1;
    private _imageBitmapCache: (ImageBitmap | null)[] = [];
    private _offscreenCanvas: HTMLCanvasElement | null = null; // reuse to avoid allocations

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        source: string | null,
        playbackSpeed: number,
        opacity = 1
    ) {
        super(x, y, 1, 1, opacity);
        this.width = width;
        this.height = height;
        this.source = source;
        this.fitMode = 'contain';
        this.preserveAspectRatio = true;
        this.playbackSpeed = playbackSpeed || 1;
    }

    setSource(src: string | null) {
        if (src !== this.source) {
            this.source = src;
            this._frames = null;
            this._totalDurationMs = 0;
            this._decodeStarted = false;
            this._decodeError = null;
            this._lastFrameIndex = -1;
            this._imageBitmapCache = [];
        }
        return this;
    }
    setPlaybackSpeed(speed: number) {
        this.playbackSpeed = Math.max(0.01, speed || 1);
        return this;
    }
    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none') {
        this.fitMode = mode;
        return this;
    }
    setPreserveAspectRatio(val: boolean) {
        this.preserveAspectRatio = val;
        return this;
    }
    setDimensions(width: number, height: number) {
        this.width = width;
        this.height = height;
        return this;
    }

    #startDecode() {
        if (this._decodeStarted || !this.source) return;
        this._decodeStarted = true;
        imageLoader
            .loadGIF(this.source)
            .then((gif: LoadedGIF) => {
                if (!this.source) return; // source may have changed
                this._frames = gif.frames;
                this._totalDurationMs = gif.totalDurationMs;
                this._imageBitmapCache = new Array(gif.frames.length).fill(null);
            })
            .catch((e) => {
                this._decodeError = e;
                console.warn('GIF decode failed', e);
            });
    }

    #getCurrentFrameIndex(currentTimeSeconds: number): number {
        if (!this._frames || this._frames.length === 0 || this._totalDurationMs <= 0) return -1;
        const scaledMs = (currentTimeSeconds * 1000 * this.playbackSpeed) % this._totalDurationMs;
        let acc = 0;
        for (let i = 0; i < this._frames.length; i++) {
            acc += this._frames[i].delay;
            if (scaledMs < acc) return i;
        }
        return this._frames.length - 1;
    }

    async #ensureBitmap(frameIndex: number) {
        if (!this._frames) return null;
        if (!('createImageBitmap' in window)) return null; // Fallback draws via putImageData
        if (this._imageBitmapCache[frameIndex]) return this._imageBitmapCache[frameIndex];
        try {
            const frame = this._frames[frameIndex];
            const bmp = await createImageBitmap(frame.image);
            this._imageBitmapCache[frameIndex] = bmp;
            return bmp;
        } catch (e) {
            console.warn('createImageBitmap failed', e);
            return null;
        }
    }

    #calculateDrawParams(imgWidth: number, imgHeight: number) {
        if (!this.preserveAspectRatio || this.fitMode === 'fill')
            return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        const containerAspect = this.width / this.height;
        const imageAspect = imgWidth / imgHeight;
        let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
        if (this.fitMode === 'contain') {
            if (imageAspect > containerAspect) {
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            } else {
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            }
        } else if (this.fitMode === 'cover') {
            if (imageAspect > containerAspect) {
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            } else {
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            }
        } else {
            drawWidth = Math.min(imgWidth, this.width);
            drawHeight = Math.min(imgHeight, this.height);
            drawX = (this.width - drawWidth) / 2;
            drawY = (this.height - drawHeight) / 2;
        }
        return { drawX, drawY, drawWidth, drawHeight };
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, currentTime: number): void {
        if (!this.source) {
            this.#drawPlaceholder(ctx, 'No GIF');
            return;
        }
        if (!this._frames) this.#startDecode();
        if (this._decodeError) {
            this.#drawPlaceholder(ctx, 'GIF error');
            return;
        }
        if (!this._frames) {
            this.#drawPlaceholder(ctx, 'Decoding');
            return;
        }
        const frameIndex = this.#getCurrentFrameIndex(currentTime);
        if (frameIndex < 0) {
            this.#drawPlaceholder(ctx, 'Empty GIF');
            return;
        }
        const frame = this._frames[frameIndex];
        const imgWidth = frame.image.width;
        const imgHeight = frame.image.height;
        const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgWidth, imgHeight);
        // Try bitmap for performance, else putImageData scaled via offscreen canvas
        const bmp = this._imageBitmapCache[frameIndex];
        if (bmp) {
            ctx.drawImage(bmp, drawX, drawY, drawWidth, drawHeight);
        } else {
            // Kick off async creation (fire and forget)
            if (this._lastFrameIndex !== frameIndex) {
                this.#ensureBitmap(frameIndex);
                this._lastFrameIndex = frameIndex;
            }
            // Draw via reusable offscreen canvas
            if (!this._offscreenCanvas) this._offscreenCanvas = document.createElement('canvas');
            const off = this._offscreenCanvas;
            if (off.width !== imgWidth) off.width = imgWidth;
            if (off.height !== imgHeight) off.height = imgHeight;
            const offCtx = off.getContext('2d');
            if (offCtx) offCtx.putImageData(frame.image, 0, 0);
            ctx.drawImage(off, drawX, drawY, drawWidth, drawHeight);
        }
    }

    #drawPlaceholder(ctx: CanvasRenderingContext2D, msg: string) {
        ctx.fillStyle = 'rgba(200,200,200,0.3)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.strokeRect(0, 0, this.width, this.height);
        ctx.fillStyle = 'rgba(60,60,60,0.8)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, this.width / 2, this.height / 2);
    }

    isReady(): boolean {
        return !!this._frames;
    }

    getBounds(): Bounds {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
