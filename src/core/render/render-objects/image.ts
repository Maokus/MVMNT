import { RenderObject, RenderConfig, Bounds } from './base';

// Render object now expects an already-loaded image element (provided by scene element)
// and stays deterministic (no async / no loader coupling).
export class Image extends RenderObject {
    width: number;
    height: number;
    imageElement: HTMLImageElement | null;
    preserveAspectRatio: boolean;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    // Track intrinsic dimensions of the loaded image so bounds can reflect actual drawn content
    private _intrinsicWidth: number | null = null;
    private _intrinsicHeight: number | null = null;
    private _lastDebuggedState?: { opacity: number; rotation: number; scaleX: number; scaleY: number };
    private _hasBeenDrawnSuccessfully?: boolean;
    private _status: 'idle' | 'loading' | 'ready' | 'error' | 'empty';

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        imageElement: HTMLImageElement | null,
        opacity = 1,
        options: {
            fitMode?: 'contain' | 'cover' | 'fill' | 'none';
            preserveAspectRatio?: boolean;
            status?: string;
            includeInLayoutBounds?: boolean;
        } = {}
    ) {
        super(x, y, 1, 1, opacity, { includeInLayoutBounds: options.includeInLayoutBounds });
        this.width = width;
        this.height = height;
        this.imageElement = imageElement;
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
        this.fitMode = options.fitMode ?? 'contain';
        this._status = (options.status as any) || (imageElement ? 'ready' : 'idle');
    }

    setImageElement(img: HTMLImageElement | null, status: 'loading' | 'ready' | 'error' | 'empty' | 'idle' = 'ready') {
        this.imageElement = img;
        this._status = img ? 'ready' : status;
        if (img) {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (w && h) {
                this._intrinsicWidth = w;
                this._intrinsicHeight = h;
            }
        } else {
            this._intrinsicWidth = null;
            this._intrinsicHeight = null;
        }
        this._hasBeenDrawnSuccessfully = false; // force debug info once
        return this;
    }
    setStatus(status: 'loading' | 'ready' | 'error' | 'empty' | 'idle') {
        if (this._status !== status) this._status = status;
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

    #calculateDrawParams(): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
        if (!this.imageElement) return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        const imgWidth = this.imageElement.naturalWidth || this.imageElement.width;
        const imgHeight = this.imageElement.naturalHeight || this.imageElement.height;
        if (!imgWidth || !imgHeight) return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
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
        if (!this.imageElement) {
            const msg =
                this._status === 'loading'
                    ? 'Loading...'
                    : this._status === 'error'
                    ? 'Error'
                    : this._status === 'empty'
                    ? 'No image'
                    : 'Image';
            this.#drawPlaceholder(ctx, msg, this._status === 'error' ? 'red' : 'rgba(150,150,150,0.8)');
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
            this._status = 'error';
            this.#drawPlaceholder(ctx, 'Error', 'rgba(255,100,100,0.8)');
        }
        if (this.fitMode === 'cover') ctx.restore();
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
        return !!this.imageElement;
    }
    protected _getSelfBounds(): Bounds {
        // For cover / fill we keep the container bounds (cover may draw outside but is clipped; fill stretches)
        if (this.fitMode === 'cover' || this.fitMode === 'fill' || !this.preserveAspectRatio) {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }
        // If we have intrinsic dimensions and are in contain/none, compute the actual drawn rect
        if (this.imageElement && this._intrinsicWidth && this._intrinsicHeight) {
            const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams();
            return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
        }
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
