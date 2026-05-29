import { BoxRenderObject } from './box';
import { type RenderConfig, type Bounds, type LayoutParticipation } from './base';
import { applyShadow, clearShadow } from './style-helpers';
import { type VisualResource, type ResourceStatus, getFrameAtTime } from '@core/resources/visual-resource';

// ─── Frame placement ─────────────────────────────────────────────────────────

/**
 * Named presets for `framePlacement`. Each preset anchors the same logical
 * point on both the container and the frame (e.g. 'bottom-center' aligns the
 * frame's bottom-center with the container's bottom-center).
 *
 * Only meaningful when `fitMode` is `'clip'`.
 */
export type FramePlacementPreset =
    | 'center'
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center-left'
    | 'center-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

/**
 * Custom frame placement: independently specify which point on the container
 * (`container`) is aligned with which point on the frame (`frame`), both as
 * (x, y) fractions in [0, 1].
 *
 *   frameBaseX = container[0] * containerWidth  − frame[0] * frameWidth
 *   frameBaseY = container[1] * containerHeight − frame[1] * frameHeight
 *
 * Example: `{ container: [0.5, 1], frame: [0.5, 1] }` pins the frame's
 * bottom-center to the container's bottom-center (same as 'bottom-center').
 */
export type FramePlacementCustom = {
    container: [number, number];
    frame: [number, number];
};

/**
 * How the image frame is positioned inside the container box.
 * Only applies to `fitMode: 'clip'`.
 *
 * Use a named preset for common layouts, or a `FramePlacementCustom` object
 * when the container and frame anchor points differ.
 */
export type FramePlacement = FramePlacementPreset | FramePlacementCustom;

const PRESET_VALUES: Record<FramePlacementPreset, [number, number, number, number]> = {
    //                          contX  contY  frameX frameY
    center: [0.5, 0.5, 0.5, 0.5],
    'top-left': [0, 0, 0, 0],
    'top-center': [0.5, 0, 0.5, 0],
    'top-right': [1, 0, 1, 0],
    'center-left': [0, 0.5, 0, 0.5],
    'center-right': [1, 0.5, 1, 0.5],
    'bottom-left': [0, 1, 0, 1],
    'bottom-center': [0.5, 1, 0.5, 1],
    'bottom-right': [1, 1, 1, 1],
};

/**
 * Controls how VisualMedia computes its own bounding rect (independent of layout participation).
 * - 'drawn'     Bounds = actually drawn / scaled image region (default).
 * - 'container' Bounds = full container rect (width × height).
 */
export type SelfBoundsMode = 'drawn' | 'container';

// ─── VisualMediaOptions ───────────────────────────────────────────────────────

/**
 * Constructor / build options for VisualMedia.
 *
 * ## origin vs frame placement — two separate concerns
 *
 * **`originX/Y`** — transform origin of the media *box*, stored as fractions of
 * (width, height). The box's world position and rotation/scale axis.
 * Default (0, 0) = top-left corner. (0.5, 1) = bottom-center.
 *
 * **`framePlacement`** — where the image sits *inside* the box.
 * Only applies to `fitMode: 'clip'`. Default `'center'`.
 *
 * ## Layout bounds
 *
 * `layoutBoundsMode` replaces the old `includeInLayoutBounds` boolean:
 *   - `'drawn'`     Bounds = actual drawn / scaled image region (default).
 *   - `'container'` Bounds = full container rect (width × height).
 *   - `'none'`      Excluded from layout bounds entirely.
 */
export type VisualMediaOptions = {
    /**
     * How the image fits in the container.
     * - `'contain'` Scale to fit within the box, preserving aspect ratio. Bars visible.
     * - `'cover'`   Scale to fill the box, preserving aspect. Overflowing pixels clipped.
     * - `'fill'`    Stretch to fill (distorts non-square images).
     * - `'clip'`    Native pixel size (1:1, no scaling). Use `framePlacement` to position.
     */
    fitMode?: 'contain' | 'cover' | 'fill' | 'clip';
    preserveAspectRatio?: boolean;
    /** @deprecated Use `layoutBoundsMode: 'none'` instead. */
    includeInLayoutBounds?: boolean;
    layoutBoundsMode?: 'container' | 'drawn' | 'none';
    /** Transform origin X as fraction of container width (0–1). Default 0 (left). */
    originX?: number;
    /** Transform origin Y as fraction of container height (0–1). Default 0 (top). */
    originY?: number;
    /** @deprecated Use `originX` instead. */
    pivotFractionX?: number;
    /** @deprecated Use `originY` instead. */
    pivotFractionY?: number;
    /**
     * Where the image frame is positioned inside the container box.
     * Only applies to `fitMode: 'clip'`. Default `'center'`.
     */
    framePlacement?: FramePlacement;
    /** @deprecated Use `framePlacement` instead. */
    contentAnchorX?: number;
    /** @deprecated Use `framePlacement` instead. */
    contentAnchorY?: number;
    /** @deprecated Use `framePlacement` instead. */
    frameAnchorX?: number;
    /** @deprecated Use `framePlacement` instead. */
    frameAnchorY?: number;
    /**
     * Draw a debug overlay each frame showing the container outline, drawn-region
     * border, origin point, and frame placement anchor.
     */
    showDebug?: boolean;
};

// ─── VisualMedia ─────────────────────────────────────────────────────────────

/**
 * VisualMedia — a render object that draws any VisualResource.
 *
 * Asset-agnostic and deterministic: the owning element resolves descriptors,
 * manages the VisualResourceHandle lifecycle, and feeds the decoded resource in
 * via setResource() each frame. VisualMedia has no internal asset slot and no
 * destroy() method.
 *
 * ## origin vs frame placement
 *
 * **origin** (`setOriginFraction`) is the transform origin of the container *box*:
 * the world position of the element and the axis for rotation / scale.
 * Default (0, 0) = top-left corner. Example: (0.5, 1) = bottom-center.
 *
 * **frame placement** (`setFramePlacement`) controls where the image sits *inside*
 * the box. Only meaningful for `fitMode: 'clip'`. Default: `'center'`.
 *
 * ## Fit modes
 *
 * | Mode      | Behaviour                                                                  |
 * |-----------|----------------------------------------------------------------------------|
 * | 'contain' | Scale to fit within the container box, preserving aspect ratio. Bars      |
 * |           | (letterbox/pillarbox) visible when aspects differ. Bounds = scaled rect.   |
 * | 'cover'   | Scale to fill the container, preserving aspect ratio. Overflows clipped.   |
 * |           | Bounds = full container.                                                   |
 * | 'fill'    | Stretch to exactly fill the container. Distorts non-square images.         |
 * |           | Bounds = full container.                                                   |
 * | 'clip'    | Draw at native pixel size (1:1, no scaling). Frame position inside the     |
 * |           | box is controlled by setFramePlacement (default: 'center'). The image      |
 * |           | is clipped to container edges if it overflows. Bounds = drawn region.      |
 *
 * ## Key APIs
 *
 * - `setOriginFraction(x, y)`  — transform origin of the box as fractions of its size.
 * - `setFramePlacement(p)`     — positions the frame inside the box ('clip' mode only).
 * - `setLayoutBoundsMode(mode)` — 'drawn' | 'container' | 'none'.
 * - `showDebug = true`          — overlays container, drawn region, origin, and frame anchor.
 */
export class VisualMedia extends BoxRenderObject {
    fitMode: 'contain' | 'cover' | 'fill' | 'clip';
    preserveAspectRatio: boolean;
    /**
     * When true (or when `config.showDebug` is set), draws a debug overlay showing:
     * - Cyan dashed outline: the container rect.
     * - Green solid rect: the actual drawn / clipped region.
     * - Purple dashed rect: the full unclipped frame rect ('clip' mode only).
     * - Orange crosshair: the frame placement anchor point inside the container.
     * - Yellow diamond: the origin / transform origin inside the container.
     */
    showDebug: boolean;
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;

    private _resource: VisualResource | null = null;
    private _status: ResourceStatus = 'idle';
    private _localTime: number = 0;
    private _animationName: string | null = null;

    /**
     * Content anchor (0–1): the point inside the container where the frame is placed.
     * Only used by fitMode 'clip'. Default 0.5 (center).
     */
    private _contentAnchorX: number = 0.5;
    private _contentAnchorY: number = 0.5;
    /**
     * Frame anchor (0–1): the point on the frame that maps to the content anchor.
     * Only used by fitMode 'clip'. Default 0.5 (center).
     */
    private _frameAnchorX: number = 0.5;
    private _frameAnchorY: number = 0.5;

    selfBoundsMode: SelfBoundsMode = 'drawn';

    constructor(x: number, y: number, width: number, height: number, options: VisualMediaOptions = {}) {
        super(x, y, width, height);
        this.fitMode = options.fitMode ?? 'contain';
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
        this.showDebug = options.showDebug ?? false;
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;

        // layoutBoundsMode wins; fall back to includeInLayoutBounds for compat.
        if (options.layoutBoundsMode) {
            this.setLayoutBoundsMode(options.layoutBoundsMode);
        } else if (options.includeInLayoutBounds === false) {
            this.setLayoutBoundsMode('none');
        }

        // framePlacement wins over individual contentAnchor/frameAnchor options.
        if (options.framePlacement) {
            this.setFramePlacement(options.framePlacement);
        } else {
            if (options.contentAnchorX !== undefined) this._contentAnchorX = options.contentAnchorX;
            if (options.contentAnchorY !== undefined) this._contentAnchorY = options.contentAnchorY;
            if (options.frameAnchorX !== undefined) this._frameAnchorX = options.frameAnchorX;
            if (options.frameAnchorY !== undefined) this._frameAnchorY = options.frameAnchorY;
        }

        // originX/Y wins over deprecated pivotFractionX/Y.
        const ox = options.originX ?? options.pivotFractionX;
        const oy = options.originY ?? options.pivotFractionY;
        if (ox !== undefined || oy !== undefined) {
            this.setOriginFraction(ox ?? 0, oy ?? 0);
        }
    }

    /** @deprecated Use setOriginFraction instead. */
    override setPivotFraction(x: number, y: number): this {
        return this.setOriginFraction(x, y);
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

    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'clip'): this {
        this.fitMode = mode;
        return this;
    }

    setDimensions(width: number, height: number): this {
        return this.setSize(width, height);
    }

    setPreserveAspectRatio(val: boolean): this {
        this.preserveAspectRatio = val;
        return this;
    }

    setShadow(color: string | null, blur = 10, offsetX = 0, offsetY = 0): this {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }

    /**
     * Position the image frame inside the container box. Only applies to
     * `fitMode: 'clip'`. Default `'center'`.
     *
     * Use a named preset for common layouts:
     *   'center' | 'top-left' | 'top-center' | 'top-right'
     *   'center-left' | 'center-right'
     *   'bottom-left' | 'bottom-center' | 'bottom-right'
     *
     * Or pass `{ container: [cx, cy], frame: [fx, fy] }` for custom placement:
     *   frameBaseX = cx * containerWidth  − fx * frameWidth
     *   frameBaseY = cy * containerHeight − fy * frameHeight
     */
    setFramePlacement(placement: FramePlacement): this {
        if (typeof placement === 'string') {
            const [cx, cy, fx, fy] = PRESET_VALUES[placement];
            this._contentAnchorX = cx;
            this._contentAnchorY = cy;
            this._frameAnchorX = fx;
            this._frameAnchorY = fy;
        } else {
            this._contentAnchorX = placement.container[0];
            this._contentAnchorY = placement.container[1];
            this._frameAnchorX = placement.frame[0];
            this._frameAnchorY = placement.frame[1];
        }
        return this;
    }

    /**
     * @deprecated Use setFramePlacement instead.
     * Set where in the container box the image frame is placed (0–1 fractions).
     */
    setContentAnchor(x: number, y: number): this {
        this._contentAnchorX = x;
        this._contentAnchorY = y;
        return this;
    }

    /**
     * @deprecated Use setFramePlacement instead.
     * Set which point on the image frame maps to the content anchor (0–1 fractions).
     */
    setFrameAnchor(x: number, y: number): this {
        this._frameAnchorX = x;
        this._frameAnchorY = y;
        return this;
    }

    /** Set which rect VisualMedia uses for its own bounding contribution. */
    setSelfBoundsMode(mode: SelfBoundsMode): this {
        this.selfBoundsMode = mode;
        return this;
    }

    /**
     * @deprecated Use setSelfBoundsMode() + setLayoutParticipation() instead.
     * Set the layout bounds policy:
     * - `'drawn'`     Layout bounds track the actual drawn/scaled image region (default).
     * - `'container'` Layout bounds equal the full container rect.
     * - `'none'`      Excluded from layout bounds entirely.
     */
    setLayoutBoundsMode(mode: 'container' | 'drawn' | 'none'): this {
        if (mode === 'none') {
            this.layoutParticipation = 'exclude';
        } else {
            if (this.layoutParticipation === 'exclude') this.layoutParticipation = 'auto';
            this.selfBoundsMode = mode;
        }
        return this;
    }

    override setIncludeInLayoutBounds(include: boolean | undefined): this {
        if (include === false) {
            this.layoutParticipation = 'exclude';
            return this;
        }
        if (this.layoutParticipation === 'exclude') this.layoutParticipation = 'auto';
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
     *     draw origin in _renderSelf; may be outside [0,container] for 'clip' mode).
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
            // 'clip': draw at native pixel size (1:1 scale).
            // Place the frame using framePlacement (stored as content/frame anchor pairs):
            //   baseX = contentAnchorX * containerW − frameAnchorX * frameW
            // Canvas clipping (applied in _renderSelf) handles overflow.
            // trimOffset is applied on top of baseX/Y and is treated as frame
            // reconstruction only — it does not interact with the origin or framePlacement.
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
        const debug = this.showDebug || config.showDebug;

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
            if (debug) this.#drawDebugOverlay(ctx);
            return;
        }

        // Determine which frame list and duration to use.
        const activeAnim = this._animationName != null ? resource.animations[this._animationName] : null;
        const frames = activeAnim ? activeAnim.frames : resource.frames;
        const totalDurationMs = activeAnim ? activeAnim.totalDurationMs : resource.totalDurationMs;

        const frame = getFrameAtTime(frames, totalDurationMs, this._localTime, activeAnim?.loopMode ?? 'loop');
        if (!frame.drawable) {
            this.#drawPlaceholder(ctx, 'Empty', 'rgba(150,150,150,0.8)');
            if (debug) this.#drawDebugOverlay(ctx);
            return;
        }

        // Use per-frame logicalSize if present (Sparrow frames), otherwise fall back
        // to resource-level logical dimensions.
        const imgW = frame.logicalSize?.w ?? (resource.logicalWidth || resource.width);
        const imgH = frame.logicalSize?.h ?? (resource.logicalHeight || resource.height);
        const params = this.#calculateDrawParams(imgW, imgH);
        const { baseX, baseY, scaleX, scaleY } = params;

        applyShadow(ctx, this);

        // Sparrow trimOffset adjusts for where the visible pixels sit within the
        // logical frame. It is frame-reconstruction data only and does not interact
        // with the origin or framePlacement systems.
        const trimX = (frame.trimOffset?.x ?? 0) * scaleX;
        const trimY = (frame.trimOffset?.y ?? 0) * scaleY;
        const destX = baseX + trimX;
        const destY = baseY + trimY;

        // 'cover' clips overflow; 'clip' clips because the frame origin can
        // be negative when framePlacement places the frame partially outside the box.
        const needsClip = this.fitMode === 'cover' || this.fitMode === 'clip';
        if (needsClip) {
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

        if (needsClip) ctx.restore();

        clearShadow(ctx, this);

        if (debug) this.#drawDebugOverlay(ctx, params, imgW, imgH);
    }

    /**
     * Debug overlay drawn in container-local space (after the parent transform).
     *
     * Cyan dashed   — container rect
     * Green solid   — drawn / clipped region (when resource is loaded)
     * Purple dashed — full unclipped frame rect ('clip' mode only, may overflow)
     * Orange ⊕      — frame placement anchor point inside the container
     * Yellow ◆      — origin / transform origin inside the container
     */
    #drawDebugOverlay(
        ctx: CanvasRenderingContext2D,
        params?: { drawX: number; drawY: number; drawWidth: number; drawHeight: number; baseX: number; baseY: number },
        imgW?: number,
        imgH?: number
    ): void {
        ctx.save();
        ctx.setLineDash([]);

        // Container outline — cyan dashed
        ctx.strokeStyle = 'rgba(0,200,255,0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);

        if (params) {
            // Full unclipped frame rect ('clip' mode, may extend outside container)
            const isClipMode = this.fitMode === 'clip';
            if (isClipMode && imgW !== undefined && imgH !== undefined) {
                ctx.strokeStyle = 'rgba(180,100,255,0.6)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 5]);
                ctx.strokeRect(params.baseX, params.baseY, imgW, imgH);
            }

            // Drawn / clipped region — green solid
            if (params.drawWidth > 0 && params.drawHeight > 0) {
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.strokeRect(params.drawX, params.drawY, params.drawWidth, params.drawHeight);
            }
        }

        ctx.setLineDash([]);

        // Frame placement anchor (content anchor point) — orange crosshair with circle
        const cax = this._contentAnchorX * this.width;
        const cay = this._contentAnchorY * this.height;
        this.#drawCrosshair(ctx, cax, cay, 8, 'rgba(255,160,0,0.9)');

        // Origin (transform origin) — yellow diamond
        this.#drawDiamond(ctx, this.pivotX, this.pivotY, 6, 'rgba(255,230,0,0.95)');

        ctx.restore();
    }

    #drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    #drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.fillStyle = color + '55'; // translucent fill
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
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
        if (this.selfBoundsMode === 'container') {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        // 'drawn' (default) — visual bounds track the drawn region
        // even when excluded from layout bounds.
        if (this.fitMode === 'cover' || this.fitMode === 'fill' || !this.preserveAspectRatio) {
            return this._computeTransformedRectBounds(0, 0, this.width, this.height);
        }

        // For 'contain' and 'clip', bounds track the actual drawn region, which
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
