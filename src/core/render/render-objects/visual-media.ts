import { RenderObject, RenderConfig, Bounds } from './base';
import { VisualAsset, VisualAssetStatus, getFrameAtTime, FrameAtTime } from '@core/resources/visual-asset';

/**
 * VisualMedia — a single render object that draws any VisualAsset.
 *
 * Static images and animated GIFs are both VisualAssets; the render object
 * does not need to know which kind it holds. Frame selection for animated
 * assets is driven by `localTime`, which the owning SceneElement sets each
 * frame via `setLocalTime()`.
 *
 * `localTime = (sceneTime - elementStartTime + offset) * speed`
 *
 * This keeps timing/playback concerns in the scene element and drawing
 * concerns here.
 */
export class VisualMedia extends RenderObject {
    width: number;
    height: number;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio: boolean;

    private _asset: VisualAsset | null = null;
    private _status: VisualAssetStatus = 'idle';
    private _localTime: number = 0;
    private _lastFrame: FrameAtTime | null = null;
    private _lastDrawParams: { drawX: number; drawY: number; drawWidth: number; drawHeight: number } | null = null;

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        options: {
            fitMode?: 'contain' | 'cover' | 'fill' | 'none';
            preserveAspectRatio?: boolean;
            includeInLayoutBounds?: boolean;
        } = {}
    ) {
        super(x, y, 1, 1, 1, { includeInLayoutBounds: options.includeInLayoutBounds });
        this.width = width;
        this.height = height;
        this.fitMode = options.fitMode ?? 'contain';
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
    }

    setAsset(asset: VisualAsset | null, status?: VisualAssetStatus): this {
        this._asset = asset;
        this._status = status ?? (asset?.status ?? 'idle');
        return this;
    }

    setStatus(status: VisualAssetStatus): this {
        this._status = status;
        return this;
    }

    /** Set the pre-computed local playback time (seconds) for this frame. */
    setLocalTime(localTimeSec: number): this {
        this._localTime = localTimeSec;
        return this;
    }

    setDimensions(width: number, height: number): this {
        this.width = width;
        this.height = height;
        return this;
    }

    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none'): this {
        this.fitMode = mode;
        return this;
    }

    setPreserveAspectRatio(val: boolean): this {
        this.preserveAspectRatio = val;
        return this;
    }

    isReady(): boolean {
        return this._asset?.status === 'ready';
    }

    #calculateDrawParams(
        imgWidth: number,
        imgHeight: number
    ): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
        if (!this.preserveAspectRatio || this.fitMode === 'fill' || !imgWidth || !imgHeight) {
            return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        }
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
        const asset = this._asset;

        if (!asset || this._status !== 'ready') {
            const msg =
                this._status === 'loading'
                    ? 'Loading…'
                    : this._status === 'error'
                    ? 'Error'
                    : asset === null
                    ? 'No image'
                    : 'Image';
            this.#drawPlaceholder(ctx, msg, this._status === 'error' ? 'red' : 'rgba(150,150,150,0.8)');
            return;
        }

        const frame = getFrameAtTime(asset, this._localTime);
        this._lastFrame = frame;
        if (!frame.drawable) {
            this.#drawPlaceholder(ctx, 'Empty', 'rgba(150,150,150,0.8)');
            return;
        }

        // Use logicalWidth/logicalHeight so atlas frames lay out by frame size,
        // not by the full texture dimensions.
        const imgW = asset.logicalWidth || asset.width;
        const imgH = asset.logicalHeight || asset.height;
        const params = this.#calculateDrawParams(imgW, imgH);
        this._lastDrawParams = params;
        const { drawX, drawY, drawWidth, drawHeight } = params;

        const px = drawX - asset.pivot.x * drawWidth;
        const py = drawY - asset.pivot.y * drawHeight;

        if (this.fitMode === 'cover') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
        }

        try {
            if (frame.sourceRect) {
                // Atlas frame: draw a crop of the texture using 9-argument drawImage.
                const { sx, sy, sw, sh } = frame.sourceRect;
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, px, py, drawWidth, drawHeight);
            } else {
                ctx.drawImage(frame.drawable, px, py, drawWidth, drawHeight);
            }
        } catch {
            this.#drawPlaceholder(ctx, 'Error', 'red');
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

    protected _getSelfBounds(): Bounds {
        const pivot = this._asset?.pivot ?? { x: 0, y: 0 };

        if (this.fitMode === 'cover') {
            // Image is clipped to the container rect regardless of pivot.
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        if (this.fitMode === 'fill' || !this.preserveAspectRatio) {
            // No aspect correction; draw fills container but pivot shifts the origin.
            const px = -pivot.x * this.width;
            const py = -pivot.y * this.height;
            return this._computeTransformedRectBounds(px, py, this.width, this.height);
        }

        // contain / none with preserveAspectRatio — apply pivot offset to draw params.
        const withPivot = (drawX: number, drawY: number, drawWidth: number, drawHeight: number) =>
            this._computeTransformedRectBounds(
                drawX - pivot.x * drawWidth,
                drawY - pivot.y * drawHeight,
                drawWidth,
                drawHeight
            );

        if (this._lastDrawParams) {
            const { drawX, drawY, drawWidth, drawHeight } = this._lastDrawParams;
            return withPivot(drawX, drawY, drawWidth, drawHeight);
        }
        // Compute bounds from asset intrinsics if available, before first draw
        if (this._asset?.status === 'ready') {
            const imgW = this._asset.logicalWidth || this._asset.width;
            const imgH = this._asset.logicalHeight || this._asset.height;
            if (imgW && imgH) {
                const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgW, imgH);
                return withPivot(drawX, drawY, drawWidth, drawHeight);
            }
        }
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
