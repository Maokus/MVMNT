import { RenderConfig } from './base';
import { EmptyRenderObject } from './empty';

// Shared offscreen canvas — reused each frame to avoid allocation pressure.
// Safe because rendering is synchronous (no two GlowLayers render concurrently).
let _offscreenEl: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

// Second shared offscreen used for the downscaled blur pass (see glowResolution).
let _glowScaleEl: HTMLCanvasElement | null = null;
let _glowScaleCtx: CanvasRenderingContext2D | null = null;

function resetOffscreenCtx(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
}

function getOffscreenCtx(w: number, h: number): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    if (!_offscreenEl || !_offscreenCtx) {
        _offscreenEl = document.createElement('canvas');
        _offscreenCtx = _offscreenEl.getContext('2d');
        if (!_offscreenCtx) return null;
    }
    if (_offscreenEl.width !== w || _offscreenEl.height !== h) {
        // Assigning width/height resets pixels AND context state automatically.
        _offscreenEl.width = w;
        _offscreenEl.height = h;
    }
    // clearRect is affected by the current transform, so reset state before
    // clearing. Otherwise a transformed GlowLayer can leave stale pixels in
    // the shared buffer for the next frame.
    resetOffscreenCtx(_offscreenCtx);
    _offscreenCtx.clearRect(0, 0, w, h);
    return _offscreenCtx;
}

function getScaledGlowCtx(w: number, h: number): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    if (!_glowScaleEl || !_glowScaleCtx) {
        _glowScaleEl = document.createElement('canvas');
        _glowScaleCtx = _glowScaleEl.getContext('2d');
        if (!_glowScaleCtx) return null;
    }
    if (_glowScaleEl.width !== w || _glowScaleEl.height !== h) {
        _glowScaleEl.width = w;
        _glowScaleEl.height = h;
    } else {
        _glowScaleCtx.clearRect(0, 0, w, h);
    }
    return _glowScaleCtx;
}

/**
 * A container that renders its children twice:
 *   1. Normal pass — drawn as-is (via EmptyRenderObject.render).
 *   2. Glow pass — blurred and composited with a blend mode (default: 'screen').
 *
 * On a dark background, 'screen' makes bright shapes appear to emit light.
 * The glow pass renders children to a shared offscreen canvas and composites
 * the blurred result in a single drawImage, avoiding per-shape flicker.
 *
 * glowResolution (0–1, default 0.5): fraction of canvas resolution used for the
 * blur pass. Lower values are significantly cheaper — 0.5 = 4× fewer pixels,
 * 0.25 = 16× fewer. Visual quality loss is negligible for bloom/glow effects
 * since the blur already removes high-frequency detail.
 *
 * Usage:
 *   const glow = new GlowLayer({ glowBlur: 12, glowOpacity: 0.75 });
 *   noteRects.forEach(r => glow.addChild(r));
 *   return [glow];
 */
export class GlowLayer extends EmptyRenderObject {
    glowBlur: number;
    glowOpacity: number;
    glowBlendMode: GlobalCompositeOperation;
    /** Fraction of canvas resolution used for the blur pass (0–1). Lower = faster. */
    glowResolution: number;

    constructor(options?: {
        glowBlur?: number;
        glowOpacity?: number;
        glowBlendMode?: GlobalCompositeOperation;
        glowResolution?: number;
    }) {
        super();
        this.glowBlur = options?.glowBlur ?? 8;
        this.glowOpacity = options?.glowOpacity ?? 0.7;
        this.glowBlendMode = options?.glowBlendMode ?? 'screen';
        this.glowResolution = options?.glowResolution ?? 0.5;
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        // Pass 1: normal render via EmptyRenderObject
        super.render(ctx, config, currentTime);

        // Pass 2: glow — render children to an offscreen canvas, then composite with blur
        // in a single drawImage call. Blurring the composite image avoids the per-shape
        // blur compositing artifacts (non-linear glow accumulation) that cause flickering.
        if (this.glowBlur <= 0 || this.glowOpacity <= 0) return;

        const mainCanvas = config.canvas;
        const offCtx = mainCanvas ? getOffscreenCtx(mainCanvas.width, mainCanvas.height) : null;

        if (offCtx) {
            offCtx.setTransform(ctx.getTransform());
            this._applyLayerTransform(offCtx);
            for (const child of this.getChildren()) child.render(offCtx, config, currentTime);

            // Downscale the offscreen to glowResolution before blurring.
            // The blur filter operates on fewer pixels, giving the same visual
            // glow radius at a fraction of the GPU cost.
            const canvasW = mainCanvas!.width;
            const canvasH = mainCanvas!.height;
            const glowScale = Math.max(0.05, Math.min(1.0, this.glowResolution));
            let blurSource: CanvasImageSource = _offscreenEl!;
            let blurSourceW = canvasW;
            let blurSourceH = canvasH;
            if (glowScale < 1.0) {
                const gw = Math.max(1, Math.ceil(canvasW * glowScale));
                const gh = Math.max(1, Math.ceil(canvasH * glowScale));
                const scaledCtx = getScaledGlowCtx(gw, gh);
                if (scaledCtx) {
                    scaledCtx.drawImage(_offscreenEl!, 0, 0, gw, gh);
                    blurSource = _glowScaleEl!;
                    blurSourceW = gw;
                    blurSourceH = gh;
                }
            }

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha *= this.opacity * this.glowOpacity;
            ctx.globalCompositeOperation = this.glowBlendMode;
            ctx.filter = `blur(${this.glowBlur}px)`;
            ctx.drawImage(blurSource, 0, 0, blurSourceW, blurSourceH, 0, 0, canvasW, canvasH);
            ctx.restore();
        } else {
            // Fallback when no main canvas in config: per-shape blur (original approach).
            ctx.save();
            this._applyLayerTransform(ctx);
            ctx.globalAlpha *= this.opacity * this.glowOpacity;
            ctx.globalCompositeOperation = this.glowBlendMode;
            ctx.filter = `blur(${this.glowBlur}px)`;
            for (const child of this.getChildren()) child.render(ctx, config, currentTime);
            ctx.restore();
        }
    }

    setGlow(blur: number, opacity = 0.7, blendMode: GlobalCompositeOperation = 'screen', resolution = 0.5): this {
        this.glowBlur = blur;
        this.glowOpacity = opacity;
        this.glowBlendMode = blendMode;
        this.glowResolution = resolution;
        return this;
    }
}
