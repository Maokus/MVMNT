import { RenderObject, RenderConfig, Bounds } from './base';
import { VisualAsset, VisualAssetStatus, getFrameAtTime, FrameAtTime } from '@core/resources/visual-asset';
import { AssetRefSlot } from '@core/resources/visual-asset-slot';

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
    private _lastDrawParams: {
        drawX: number;
        drawY: number;
        drawWidth: number;
        drawHeight: number;
        srcRect?: { sx: number; sy: number; sw: number; sh: number };
    } | null = null;

    /** Stored origin fractions so pivot stays in sync when dimensions change. */
    private _originX: number = 0;
    private _originY: number = 0;

    private readonly _slot = new AssetRefSlot();

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        options: {
            fitMode?: 'contain' | 'cover' | 'fill' | 'none';
            preserveAspectRatio?: boolean;
            includeInLayoutBounds?: boolean;
            /**
             * Instance draw origin X as a fraction of the container width (0–1).
             * The render object's (x, y) position maps to this point on the container.
             * (0) = left edge (default). (0.5) = center. (1) = right edge.
             * Use setOrigin() to change after construction; setDimensions() keeps it in sync.
             */
            originX?: number;
            /** Instance draw origin Y as a fraction of the container height (0–1). */
            originY?: number;
        } = {}
    ) {
        super(x, y, 1, 1, 1, { includeInLayoutBounds: options.includeInLayoutBounds });
        this.width = width;
        this.height = height;
        this.fitMode = options.fitMode ?? 'contain';
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
        if (options.originX !== undefined || options.originY !== undefined) {
            this.setOrigin(options.originX ?? 0, options.originY ?? 0);
        }
    }

    setAsset(asset: VisualAsset | null, status?: VisualAssetStatus): this {
        this._asset = asset;
        this._status = status ?? asset?.status ?? 'idle';
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

    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none'): this {
        this.fitMode = mode;
        return this;
    }

    setDimensions(width: number, height: number): this {
        this.width = width;
        this.height = height;
        // Keep pivot in sync with stored origin fractions.
        this.pivotX = this._originX * width;
        this.pivotY = this._originY * height;
        return this;
    }

    setPreserveAspectRatio(val: boolean): this {
        this.preserveAspectRatio = val;
        return this;
    }

    /**
     * Set the draw origin as a fraction of the container size (0–1).
     * Stores the fractions and recomputes pivotX/pivotY from the current dimensions.
     * The pivot (inherited from RenderObject) is the local-space point that aligns with
     * the world (x, y) position and is the center of rotation/scale.
     */
    setOrigin(x: number, y: number): this {
        this._originX = x;
        this._originY = y;
        this.pivotX = x * this.width;
        this.pivotY = y * this.height;
        return this;
    }

    /**
     * Resolve a visual asset registry ID (or File) and load it.
     * Manages asset lifecycle (retain/release) internally — no external slot needed.
     * Safe to call every frame with the same or a new ID.
     */
    setAssetId(idOrSource: string | File | null): this {
        const { asset, status } = this._slot.update(idOrSource);
        this._asset = asset;
        this._status = status;
        return this;
    }

    /** Release held asset reference. Call from the owning element's onDestroy(). */
    destroy(): void {
        this._slot.destroy();
    }

    isReady(): boolean {
        return this._asset?.status === 'ready';
    }

    #calculateDrawParams(
        imgWidth: number,
        imgHeight: number
    ): {
        drawX: number;
        drawY: number;
        drawWidth: number;
        drawHeight: number;
        srcRect?: { sx: number; sy: number; sw: number; sh: number };
    } {
        if (!this.preserveAspectRatio || this.fitMode === 'fill' || !imgWidth || !imgHeight) {
            return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        }
        const containerAspect = this.width / this.height;
        const imageAspect = imgWidth / imgHeight;
        let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
        let srcRect: { sx: number; sy: number; sw: number; sh: number } | undefined;
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
            // none: draw at intrinsic pixel size, centered, crop to container bounds
            const visW = Math.min(imgWidth, this.width);
            const visH = Math.min(imgHeight, this.height);
            drawWidth = visW;
            drawHeight = visH;
            drawX = (this.width - visW) / 2;
            drawY = (this.height - visH) / 2;
            srcRect = {
                sx: (imgWidth - visW) / 2,
                sy: (imgHeight - visH) / 2,
                sw: visW,
                sh: visH,
            };
        }
        return { drawX, drawY, drawWidth, drawHeight, srcRect };
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

        // Use per-frame logicalSize if present (Sparrow frames), otherwise fall back
        // to asset-level logical dimensions so atlas frames lay out by frame size.
        const imgW = frame.logicalSize?.w ?? (asset.logicalWidth || asset.width);
        const imgH = frame.logicalSize?.h ?? (asset.logicalHeight || asset.height);
        const params = this.#calculateDrawParams(imgW, imgH);
        this._lastDrawParams = params;
        const { drawX, drawY, drawWidth, drawHeight } = params;

        // Scale factors: screen pixels per logical pixel
        const scaleX = imgW > 0 ? drawWidth / imgW : 1;
        const scaleY = imgH > 0 ? drawHeight / imgH : 1;

        // Trim offset: where within the logical frame the visible content begins.
        // Scaled to match the drawn frame size.
        const trimX = (frame.trimOffset?.x ?? 0) * scaleX;
        const trimY = (frame.trimOffset?.y ?? 0) * scaleY;

        // Top-left of the actual content pixels in container space.
        // The base class pivot (set via setOrigin) has already shifted the coordinate
        // system so that (drawX, drawY) aligns correctly with the world position.
        const destX = drawX + trimX;
        const destY = drawY + trimY;

        if (this.fitMode === 'cover') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
        }

        try {
            if (frame.rotated && frame.sourceRect) {
                // Frame stored 90° CW in atlas — rotate back 90° CCW.
                // After un-rotation: logical content is (sh × sw) pixels.
                const { sx, sy, sw, sh } = frame.sourceRect;
                const contentW = sh * scaleX;
                const contentH = sw * scaleY;
                ctx.save();
                ctx.translate(destX + contentW / 2, destY + contentH / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, -contentH / 2, -contentW / 2, contentH, contentW);
                ctx.restore();
            } else if (frame.sourceRect) {
                // Atlas frame (uniform grid or Sparrow without rotation).
                // Scale content proportionally within the logical frame.
                const { sx, sy, sw, sh } = frame.sourceRect;
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, destX, destY, sw * scaleX, sh * scaleY);
            } else if (params.srcRect) {
                // "none" fit mode: draw at intrinsic size with center crop to container bounds.
                const { sx, sy, sw, sh } = params.srcRect;
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, destX, destY, drawWidth, drawHeight);
            } else {
                ctx.drawImage(frame.drawable, destX, destY, drawWidth, drawHeight);
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
        if (this.fitMode === 'cover') {
            // Image is clipped to the container rect; pivot is not relevant for bounds.
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        if (this.fitMode === 'fill' || !this.preserveAspectRatio) {
            // Fill: draw occupies full container starting at (0, 0).
            // The pivot (set on base class) shifts the bounds via the world matrix.
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        // contain / none with preserveAspectRatio: pass draw params as-is.
        // The pivot is encoded in the world matrix via _getWorldTransformMatrix.
        if (this._lastDrawParams) {
            const { drawX, drawY, drawWidth, drawHeight } = this._lastDrawParams;
            return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
        }
        // Compute bounds from asset intrinsics if available, before first draw
        if (this._asset?.status === 'ready') {
            const imgW = this._asset.logicalWidth || this._asset.width;
            const imgH = this._asset.logicalHeight || this._asset.height;
            if (imgW && imgH) {
                const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgW, imgH);
                return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
            }
        }
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
