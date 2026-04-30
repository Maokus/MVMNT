import { RenderObject, type RenderConfig, type Bounds } from './base';
import { type VisualResource, type ResourceStatus, getFrameAtTime } from '@core/resources/visual-resource';

/**
 * Constructor / build options for VisualMedia.
 *
 * ## Pivot vs content anchors
 *
 * `pivotFractionX/Y` controls the **transform origin** of the media box — the
 * point at which the box is positioned and around which it rotates/scales.
 * (0.5, 1) = bottom-center of the box is the transform origin.
 *
 * `contentAnchorX/Y` + `frameAnchorX/Y` control **where the image or sprite
 * frame sits inside the box** (applies to `fitMode: 'none'` only):
 *   baseX = contentAnchorX * containerWidth  - frameAnchorX * frameWidth
 *   baseY = contentAnchorY * containerHeight - frameAnchorY * frameHeight
 * Default (0.5 / 0.5 for both) centers the frame in the box.
 */
export type VisualMediaOptions = {
    fitMode?: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio?: boolean;
    /** @deprecated Use `layoutBoundsMode: 'none'` instead. */
    includeInLayoutBounds?: boolean;
    /**
     * Controls what rect is reported as layout bounds:
     * - `'drawn'`     Layout bounds = actual drawn / scaled image region (default).
     * - `'container'` Layout bounds = the full container rect (width × height).
     * - `'none'`      Excluded from layout bounds entirely.
     */
    layoutBoundsMode?: 'container' | 'drawn' | 'none';
    /** Transform pivot X as fraction of container width (0–1). Default 0. */
    pivotFractionX?: number;
    /** Transform pivot Y as fraction of container height (0–1). Default 0. */
    pivotFractionY?: number;
    /** Content anchor X (0–1): which point in the container box the frame is placed at. Default 0.5. */
    contentAnchorX?: number;
    /** Content anchor Y (0–1). Default 0.5. */
    contentAnchorY?: number;
    /** Frame anchor X (0–1): which point on the frame maps to the content anchor. Default 0.5. */
    frameAnchorX?: number;
    /** Frame anchor Y (0–1). Default 0.5. */
    frameAnchorY?: number;
    /** Draw a debug border around the drawn region and container each frame. */
    showBounds?: boolean;
};

/**
 * VisualMedia — a render object that draws any VisualResource.
 *
 * Asset-agnostic and deterministic: the owning element resolves descriptors,
 * manages the VisualResourceHandle lifecycle, and feeds the decoded resource in
 * via setResource() each frame. VisualMedia has no internal asset slot and no
 * destroy() method.
 *
 * ## Fit modes
 *
 * | Mode      | Behaviour                                                                  |
 * |-----------|----------------------------------------------------------------------------|
 * | 'contain' | Scale to fit within the container box, preserving aspect ratio. Bars      |
 * |           | (letterbox/pillarbox) are visible when the image and container aspects     |
 * |           | differ. Bounds reflect the scaled image rect, not the full container.      |
 * | 'cover'   | Scale to fill the entire container, preserving aspect ratio. The image     |
 * |           | overflows and is clipped. Bounds equal the full container.                 |
 * | 'fill'    | Stretch to exactly fill the container. Distorts non-square images.         |
 * |           | Bounds equal the full container.                                           |
 * | 'none'    | Draw at the image's native pixel size (1:1 scale, no scaling). Frame       |
 * |           | placement is controlled by contentAnchor / frameAnchor (default: center).  |
 * |           | The image is clipped to the container edges if it overflows.               |
 * |           | Bounds reflect the actual drawn (clipped) region.                          |
 */
export class VisualMedia extends RenderObject {
    width: number;
    height: number;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio: boolean;
    /** Draw a debug border around the drawn region and container outline. */
    showBounds: boolean;

    private _resource: VisualResource | null = null;
    private _status: ResourceStatus = 'idle';
    private _localTime: number = 0;
    private _animationName: string | null = null;

    /**
     * Content anchor (0–1): the point inside the container where the frame is placed.
     * Only used by fitMode 'none'. Default 0.5 (center).
     */
    private _contentAnchorX: number = 0.5;
    private _contentAnchorY: number = 0.5;
    /**
     * Frame anchor (0–1): the point on the frame that maps to the content anchor.
     * Only used by fitMode 'none'. Default 0.5 (center).
     */
    private _frameAnchorX: number = 0.5;
    private _frameAnchorY: number = 0.5;

    private _layoutBoundsMode: 'container' | 'drawn' | 'none' = 'drawn';

    constructor(x: number, y: number, width: number, height: number, options: VisualMediaOptions = {}) {
        super(x, y, 1, 1, 1);
        this.width = width;
        this.height = height;
        this.fitMode = options.fitMode ?? 'contain';
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
        this.showBounds = options.showBounds ?? false;

        // layoutBoundsMode wins; fall back to includeInLayoutBounds for compat.
        if (options.layoutBoundsMode) {
            this.setLayoutBoundsMode(options.layoutBoundsMode);
        } else if (options.includeInLayoutBounds === false) {
            this.setLayoutBoundsMode('none');
        }

        if (options.contentAnchorX !== undefined) this._contentAnchorX = options.contentAnchorX;
        if (options.contentAnchorY !== undefined) this._contentAnchorY = options.contentAnchorY;
        if (options.frameAnchorX !== undefined) this._frameAnchorX = options.frameAnchorX;
        if (options.frameAnchorY !== undefined) this._frameAnchorY = options.frameAnchorY;

        if (options.pivotFractionX !== undefined || options.pivotFractionY !== undefined) {
            super.setPivotFraction(options.pivotFractionX ?? 0, options.pivotFractionY ?? 0);
            this._reapplyPivotFraction(width, height);
        }
    }

    /**
     * Override so that setPivotFraction() immediately recomputes pivotX/Y from
     * the current dimensions, in addition to storing the fractions.
     */
    override setPivotFraction(x: number, y: number): this {
        super.setPivotFraction(x, y);
        this._reapplyPivotFraction(this.width, this.height);
        return this;
    }

    /**
     * Set the decoded resource and optional status override.
     * Safe to call every frame — just updates internal state references.
     */
    setResource(resource: VisualResource | null, status?: ResourceStatus): this {
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
        this._reapplyPivotFraction(width, height);
        return this;
    }

    setPreserveAspectRatio(val: boolean): this {
        this.preserveAspectRatio = val;
        return this;
    }

    /**
     * Set where in the container box the image frame is placed (0–1 fractions).
     * Only applies to `fitMode: 'none'`. Default (0.5, 0.5) = center.
     *
     * Used together with setFrameAnchor:
     *   baseX = contentAnchorX * containerWidth  - frameAnchorX * frameWidth
     *   baseY = contentAnchorY * containerHeight - frameAnchorY * frameHeight
     */
    setContentAnchor(x: number, y: number): this {
        this._contentAnchorX = x;
        this._contentAnchorY = y;
        return this;
    }

    /**
     * Set which point on the image frame maps to the content anchor (0–1 fractions).
     * Only applies to `fitMode: 'none'`. Default (0.5, 0.5) = center of frame.
     *
     * Example: setContentAnchor(0.5, 1) + setFrameAnchor(0.5, 1) places the
     * frame's bottom-center at the container's bottom-center.
     */
    setFrameAnchor(x: number, y: number): this {
        this._frameAnchorX = x;
        this._frameAnchorY = y;
        return this;
    }

    /**
     * Set the layout bounds policy:
     * - `'drawn'`     Layout bounds track the actual drawn/scaled image region (default).
     * - `'container'` Layout bounds equal the full container rect.
     * - `'none'`      Excluded from layout bounds entirely.
     */
    setLayoutBoundsMode(mode: 'container' | 'drawn' | 'none'): this {
        this._layoutBoundsMode = mode;
        this.includeInLayoutBounds = mode === 'none' ? false : undefined;
        return this;
    }

    override setIncludeInLayoutBounds(include: boolean | undefined): this {
        if (include === false) return this.setLayoutBoundsMode('none');
        if (this._layoutBoundsMode === 'none') this._layoutBoundsMode = 'drawn';
        super.setIncludeInLayoutBounds(include);
        return this;
    }

    isReady(): boolean {
        return this._resource?.status === 'ready';
    }

    /**
     * Compute draw parameters for the given image dimensions and the current
     * container size + fit mode.
     *
     * Returns:
     *   drawX/Y/Width/Height — the visible region in container-local space (used
     *     for bounds and debug rendering).
     *   baseX/Y — the full frame origin in container-local space (used as the
     *     draw origin in _renderSelf; may be outside [0,container] for 'none' mode).
     *   scaleX/Y — the scaling factors to apply to source dimensions.
     */
    #calculateDrawParams(
        imgWidth: number,
        imgHeight: number
    ): {
        drawX: number;
        drawY: number;
        drawWidth: number;
        drawHeight: number;
        baseX: number;
        baseY: number;
        scaleX: number;
        scaleY: number;
    } {
        if (!this.preserveAspectRatio || this.fitMode === 'fill' || !imgWidth || !imgHeight) {
            return {
                drawX: 0,
                drawY: 0,
                drawWidth: this.width,
                drawHeight: this.height,
                baseX: 0,
                baseY: 0,
                scaleX: this.width / imgWidth,
                scaleY: this.height / imgHeight,
            };
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
            return {
                drawX,
                drawY,
                drawWidth,
                drawHeight,
                baseX: drawX,
                baseY: drawY,
                scaleX: imgWidth > 0 ? drawWidth / imgWidth : 1,
                scaleY: imgHeight > 0 ? drawHeight / imgHeight : 1,
            };
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
            return {
                drawX,
                drawY,
                drawWidth,
                drawHeight,
                baseX: drawX,
                baseY: drawY,
                scaleX: imgWidth > 0 ? drawWidth / imgWidth : 1,
                scaleY: imgHeight > 0 ? drawHeight / imgHeight : 1,
            };
        } else {
            // 'none': draw at native pixel size (1:1 scale).
            // Place the frame using content/frame anchors:
            //   baseX = contentAnchorX * containerW - frameAnchorX * frameW
            // Canvas clipping (applied in _renderSelf) handles overflow.
            // trimOffset is applied on top of baseX/Y and is treated as frame
            // reconstruction only — it does not interact with the anchor system.
            const baseX = this._contentAnchorX * this.width - this._frameAnchorX * imgWidth;
            const baseY = this._contentAnchorY * this.height - this._frameAnchorY * imgHeight;
            const drawEndX = Math.min(this.width, baseX + imgWidth);
            const drawEndY = Math.min(this.height, baseY + imgHeight);
            drawX = Math.max(0, baseX);
            drawY = Math.max(0, baseY);
            return {
                drawX,
                drawY,
                drawWidth: Math.max(0, drawEndX - drawX),
                drawHeight: Math.max(0, drawEndY - drawY),
                baseX,
                baseY,
                scaleX: 1,
                scaleY: 1,
            };
        }
    }

    /**
     * Compute the current image dimensions from live state (resource + animation + time).
     * Returns {0,0} when the resource is not ready. Used by both _renderSelf and
     * _getSelfBounds so bounds are always derived from current state, never from
     * stale render-pass data.
     */
    #currentImageDimensions(): { imgW: number; imgH: number } {
        const resource = this._resource;
        if (!resource || resource.status !== 'ready') return { imgW: 0, imgH: 0 };
        const activeAnim = this._animationName != null ? resource.animations[this._animationName] : null;
        const frames = activeAnim ? activeAnim.frames : resource.frames;
        const totalDurationMs = activeAnim ? activeAnim.totalDurationMs : resource.totalDurationMs;
        const frame = getFrameAtTime(frames, totalDurationMs, this._localTime, activeAnim?.loopMode ?? 'loop');
        const imgW = frame.logicalSize?.w ?? (resource.logicalWidth || resource.width);
        const imgH = frame.logicalSize?.h ?? (resource.logicalHeight || resource.height);
        return { imgW, imgH };
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, config: RenderConfig, _currentTime: number): void {
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
            if (this.showBounds || config.showBounds) this.#drawBoundsDebug(ctx);
            return;
        }

        // Determine which frame list and duration to use.
        const activeAnim = this._animationName != null ? resource.animations[this._animationName] : null;
        const frames = activeAnim ? activeAnim.frames : resource.frames;
        const totalDurationMs = activeAnim ? activeAnim.totalDurationMs : resource.totalDurationMs;

        const frame = getFrameAtTime(frames, totalDurationMs, this._localTime, activeAnim?.loopMode ?? 'loop');
        if (!frame.drawable) {
            this.#drawPlaceholder(ctx, 'Empty', 'rgba(150,150,150,0.8)');
            if (this.showBounds || config.showBounds) this.#drawBoundsDebug(ctx);
            return;
        }

        // Use per-frame logicalSize if present (Sparrow frames), otherwise fall back
        // to resource-level logical dimensions.
        const imgW = frame.logicalSize?.w ?? (resource.logicalWidth || resource.width);
        const imgH = frame.logicalSize?.h ?? (resource.logicalHeight || resource.height);
        const params = this.#calculateDrawParams(imgW, imgH);
        const { baseX, baseY, scaleX, scaleY } = params;

        // Sparrow trimOffset adjusts for where the visible pixels sit within the
        // logical frame. It is frame-reconstruction data only and does not interact
        // with the pivot or content-anchor system.
        const trimX = (frame.trimOffset?.x ?? 0) * scaleX;
        const trimY = (frame.trimOffset?.y ?? 0) * scaleY;
        const destX = baseX + trimX;
        const destY = baseY + trimY;

        // 'cover' clips the overflowing image; 'none' clips because the frame
        // origin can be negative when baseX/Y places the frame partially outside.
        if (this.fitMode === 'cover' || this.fitMode === 'none') {
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
            } else {
                ctx.drawImage(frame.drawable, destX, destY, imgW * scaleX, imgH * scaleY);
            }
        } catch {
            this.#drawPlaceholder(ctx, 'Error', 'red');
        }

        if (this.fitMode === 'cover' || this.fitMode === 'none') ctx.restore();

        if (this.showBounds || config.showBounds) this.#drawBoundsDebug(ctx, params);
    }

    #drawBoundsDebug(
        ctx: CanvasRenderingContext2D,
        params?: { drawX: number; drawY: number; drawWidth: number; drawHeight: number }
    ): void {
        ctx.save();
        // Container outline (cyan dashed)
        ctx.strokeStyle = 'rgba(0,200,255,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);
        // Drawn region border (green solid)
        if (params && params.drawWidth > 0 && params.drawHeight > 0) {
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(params.drawX, params.drawY, params.drawWidth, params.drawHeight);
        }
        ctx.restore();
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
        if (this._layoutBoundsMode === 'container') {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        // 'drawn' (default) and 'none' — visual bounds still track the drawn region
        // even when excluded from layout bounds.
        if (this.fitMode === 'cover' || this.fitMode === 'fill' || !this.preserveAspectRatio) {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        // For 'contain' and 'none', bounds track the actual drawn region, which
        // depends on the image dimensions. Compute on demand from current state.
        const { imgW, imgH } = this.#currentImageDimensions();
        if (imgW && imgH) {
            const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgW, imgH);
            return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
        }

        // Fallback: resource not ready yet — use full container as a safe estimate.
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
