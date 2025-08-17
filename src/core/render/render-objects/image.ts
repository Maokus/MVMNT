import { RenderObject, RenderConfig, Bounds } from './base';
import { imageLoader } from '@core/resources/image-loader';

// Extend accepted sources to include File
type ImageSource = string | File | HTMLImageElement | null | undefined;

export class Image extends RenderObject {
    width: number;
    height: number;
    imageSource: ImageSource;
    imageElement: HTMLImageElement | null;
    imageLoaded: boolean;
    preserveAspectRatio: boolean;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    private _currentLoadingSource?: ImageSource;
    private _lastDebuggedState?: { opacity: number; rotation: number; scaleX: number; scaleY: number };
    private _hasBeenDrawnSuccessfully?: boolean;
    private onLoadCallback?: () => void;

    constructor(x: number, y: number, width: number, height: number, imageSource: ImageSource, opacity = 1) {
        super(x, y, 1, 1, opacity);
        this.width = width;
        this.height = height;
        this.imageSource = imageSource;
        this.imageElement = null;
        this.imageLoaded = false;
        this.preserveAspectRatio = true;
        this.fitMode = 'contain';
        if (imageSource) this.#beginLoad(imageSource); // initial async load
    }

    #beginLoad(src: ImageSource) {
        if (!src) return;
        this._currentLoadingSource = src;
        if (src instanceof HTMLImageElement) {
            this.imageElement = src;
            this.imageLoaded = !!(src.complete && src.naturalWidth > 0);
            if (!this.imageLoaded) {
                src.onload = () => {
                    if (this._currentLoadingSource !== src) return;
                    this.imageLoaded = true;
                    this.onLoadCallback?.();
                };
            }
            return;
        }
        imageLoader
            .loadImage(src as string | File)
            .then((img) => {
                if (this._currentLoadingSource !== src) return; // outdated
                this.imageElement = img;
                this.imageLoaded = true;
                this.onLoadCallback?.();
            })
            .catch((e) => {
                if (this._currentLoadingSource !== src) return;
                console.warn('Image load failed', e);
                this.imageElement = null;
                this.imageLoaded = false;
            });
    }

    #calculateDrawParams(): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
        if (!this.imageElement || !this.imageLoaded)
            return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        const imgWidth = this.imageElement.naturalWidth || this.imageElement.width;
        const imgHeight = this.imageElement.naturalHeight || this.imageElement.height;
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
            // none
            drawWidth = Math.min(imgWidth, this.width);
            drawHeight = Math.min(imgHeight, this.height);
            drawX = (this.width - drawWidth) / 2;
            drawY = (this.height - drawHeight) / 2;
        }
        return { drawX, drawY, drawWidth, drawHeight };
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        if (
            !this._lastDebuggedState ||
            this._lastDebuggedState.opacity !== this.opacity ||
            this._lastDebuggedState.rotation !== this.rotation ||
            this._lastDebuggedState.scaleX !== this.scaleX ||
            this._lastDebuggedState.scaleY !== this.scaleY
        ) {
            this._lastDebuggedState = {
                opacity: this.opacity,
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY,
            };
        }
        this.onLoadCallback = () => {
            // Global invalidation handled by visualizer via imageLoaded event; no local action needed.
        };
        if (!this.imageElement) {
            this.#drawPlaceholder(ctx, 'No image', 'red');
            return;
        }
        if (!this.imageLoaded) {
            if (this.imageElement.complete && this.imageElement.naturalWidth > 0) {
                this.imageLoaded = true;
            }
            if (!this.imageLoaded) {
                this.#drawPlaceholder(ctx, 'Loading...', 'rgba(150,150,150,0.8)');
                return;
            }
        }
        if (!this.imageElement.naturalWidth || !this.imageElement.naturalHeight) {
            this.#drawPlaceholder(ctx, 'Invalid image', 'rgba(255,100,100,0.8)');
            return;
        }
        const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams();
        if (this.fitMode === 'cover') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
        }
        try {
            ctx.drawImage(this.imageElement, drawX, drawY, drawWidth, drawHeight);
            this._hasBeenDrawnSuccessfully = true;
        } catch (error) {
            ctx.fillStyle = 'rgba(255,100,100,0.3)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.strokeStyle = 'rgba(255,100,100,0.6)';
            ctx.strokeRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(255,100,100,0.8)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Error drawing image', this.width / 2, this.height / 2);
        }
        if (this.fitMode === 'cover') ctx.restore();
    }

    setImageSource(source: ImageSource): this {
        if (source === this.imageSource && this.imageLoaded && this.imageElement) return this;
        this.imageSource = source;
        this.imageLoaded = false;
        this.imageElement = null;
        if (source) this.#beginLoad(source);
        return this;
    }
    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none'): this {
        this.fitMode = mode;
        return this;
    }
    setPreserveAspectRatio(preserve: boolean): this {
        this.preserveAspectRatio = preserve;
        return this;
    }
    setDimensions(width: number, height: number): this {
        this.width = width;
        this.height = height;
        return this;
    }
    #drawPlaceholder(ctx: CanvasRenderingContext2D, message: string, textColor: string): void {
        ctx.fillStyle = 'rgba(200,200,200,0.3)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.strokeRect(0, 0, this.width, this.height);
        ctx.fillStyle = textColor;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, this.width / 2, this.height / 2);
    }
    isReady(): boolean {
        return !!(this.imageElement && this.imageLoaded);
    }
    getBounds(): Bounds {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
