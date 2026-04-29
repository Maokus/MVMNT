import { RenderObject, RenderConfig, Bounds } from './base';
import { type DecodedResource, type ResourceStatus, getFrameAtTime, type FrameAtTime } from '@core/resources/visual-resource';

/**
 * VisualMedia — a render object that draws any DecodedResource.
 *
 * Asset-agnostic and deterministic: the owning element resolves descriptors,
 * manages the VisualResourceHandle lifecycle, and feeds the decoded resource in
 * via setResource() each frame. VisualMedia has no internal asset slot and no
 * destroy() method.
 *
 * Frame selection for animated resources is driven by `localTime` (set via
 * setLocalTime()) and `animationName` (set via setAnimation()). When an animation
 * name is set and the resource has a matching named animation, that animation's
 * frame list is used; otherwise the resource's full frame list is used.
 */
export class VisualMedia extends RenderObject {
    width: number;
    height: number;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio: boolean;

    private _resource: DecodedResource | null = null;
    private _status: ResourceStatus = 'idle';
    private _localTime: number = 0;
    private _animationName: string | null = null;
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

    /**
     * Set the decoded resource and optional status override.
     * Safe to call every frame — just updates internal state references.
     */
    setResource(resource: DecodedResource | null, status?: ResourceStatus): this {
        this._resource = resource;
        this._status = status ?? resource?.status ?? 'idle';
        return this;
    }

    setStatus(status: ResourceStatus): this {
        this._status = status;
        return this;
    }

    /** Set the pre-computed local playback time (seconds) for this frame. */
    setLocalTime(localTimeSec: number): this {
        this._localTime = localTimeSec;
        return this;
    }

    /**
     * Set the active named animation. When set and the resource has a matching
     * animation, that animation's frame list is used for rendering. Pass null to
     * play the resource's full frame sequence.
     */
    setAnimation(name: string | null): this {
        this._animationName = name;
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
     */
    setOrigin(x: number, y: number): this {
        this._originX = x;
        this._originY = y;
        this.pivotX = x * this.width;
        this.pivotY = y * this.height;
        return this;
    }

    isReady(): boolean {
        return this._resource?.status === 'ready';
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
        const resource = this._resource;

        if (!resource || this._status !== 'ready') {
            const msg =
                this._status === 'loading'
                    ? 'Loading…'
                    : this._status === 'error'
                      ? 'Error'
                      : resource === null
                        ? 'No image'
                        : 'Image';
            this.#drawPlaceholder(ctx, msg, this._status === 'error' ? 'red' : 'rgba(150,150,150,0.8)');
            return;
        }

        // Determine which frame list and duration to use.
        const activeAnim =
            this._animationName != null ? resource.animations[this._animationName] : null;
        const frames = activeAnim ? activeAnim.frames : resource.frames;
        const totalDurationMs = activeAnim ? activeAnim.totalDurationMs : resource.totalDurationMs;

        const frame = getFrameAtTime(frames, totalDurationMs, this._localTime);
        this._lastFrame = frame;
        if (!frame.drawable) {
            this.#drawPlaceholder(ctx, 'Empty', 'rgba(150,150,150,0.8)');
            return;
        }

        // Use per-frame logicalSize if present (Sparrow frames), otherwise fall back
        // to resource-level logical dimensions.
        const imgW = frame.logicalSize?.w ?? (resource.logicalWidth || resource.width);
        const imgH = frame.logicalSize?.h ?? (resource.logicalHeight || resource.height);
        const params = this.#calculateDrawParams(imgW, imgH);
        this._lastDrawParams = params;
        const { drawX, drawY, drawWidth, drawHeight } = params;

        const scaleX = imgW > 0 ? drawWidth / imgW : 1;
        const scaleY = imgH > 0 ? drawHeight / imgH : 1;

        const trimX = (frame.trimOffset?.x ?? 0) * scaleX;
        const trimY = (frame.trimOffset?.y ?? 0) * scaleY;

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
                const { sx, sy, sw, sh } = frame.sourceRect;
                const contentW = sh * scaleX;
                const contentH = sw * scaleY;
                ctx.save();
                ctx.translate(destX + contentW / 2, destY + contentH / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, -contentH / 2, -contentW / 2, contentH, contentW);
                ctx.restore();
            } else if (frame.sourceRect) {
                const { sx, sy, sw, sh } = frame.sourceRect;
                ctx.drawImage(frame.drawable, sx, sy, sw, sh, destX, destY, sw * scaleX, sh * scaleY);
            } else if (params.srcRect) {
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
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        if (this.fitMode === 'fill' || !this.preserveAspectRatio) {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        if (this._lastDrawParams) {
            const { drawX, drawY, drawWidth, drawHeight } = this._lastDrawParams;
            return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
        }
        if (this._resource?.status === 'ready') {
            const imgW = this._resource.logicalWidth || this._resource.width;
            const imgH = this._resource.logicalHeight || this._resource.height;
            if (imgW && imgH) {
                const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgW, imgH);
                return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
            }
        }
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
