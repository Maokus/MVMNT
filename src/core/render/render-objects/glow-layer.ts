import { RenderConfig } from './base';
import { EmptyRenderObject } from './empty';

// Shared offscreen canvas — reused each frame to avoid allocation pressure.
// Safe because rendering is synchronous (no two GlowLayers render concurrently).
let _offscreenEl: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

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
    } else {
        // clearRect only clears pixels — context state (globalAlpha, filter,
        // composite op, transform) persists across frames and must be reset explicitly.
        _offscreenCtx.clearRect(0, 0, w, h);
        _offscreenCtx.globalAlpha = 1;
        _offscreenCtx.globalCompositeOperation = 'source-over';
        _offscreenCtx.filter = 'none';
        _offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    return _offscreenCtx;
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
 * Usage:
 *   const glow = new GlowLayer({ glowBlur: 12, glowOpacity: 0.75 });
 *   noteRects.forEach(r => glow.addChild(r));
 *   return [glow];
 */
export class GlowLayer extends EmptyRenderObject {
    glowBlur: number;
    glowOpacity: number;
    glowBlendMode: GlobalCompositeOperation;

    constructor(options?: { glowBlur?: number; glowOpacity?: number; glowBlendMode?: GlobalCompositeOperation }) {
        super();
        this.glowBlur = options?.glowBlur ?? 8;
        this.glowOpacity = options?.glowOpacity ?? 0.7;
        this.glowBlendMode = options?.glowBlendMode ?? 'screen';
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
            offCtx.translate(this.x, this.y);
            if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
                offCtx.translate(this.anchorOffsetX, this.anchorOffsetY);
                if (this.rotation !== 0) offCtx.rotate(this.rotation);
                if (this.scaleX !== 1 || this.scaleY !== 1) offCtx.scale(this.scaleX, this.scaleY);
                if (this.skewX !== 0 || this.skewY !== 0) {
                    offCtx.transform(1, Math.tan(this.skewY), Math.tan(this.skewX), 1, 0, 0);
                }
                offCtx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
            }
            for (const child of this.getChildren()) child.render(offCtx, config, currentTime);

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha *= this.opacity * this.glowOpacity;
            ctx.globalCompositeOperation = this.glowBlendMode;
            ctx.filter = `blur(${this.glowBlur}px)`;
            ctx.drawImage(_offscreenEl!, 0, 0);
            ctx.restore();
        } else {
            // Fallback when no main canvas in config: per-shape blur (original approach).
            ctx.save();
            ctx.translate(this.x, this.y);
            if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
                ctx.translate(this.anchorOffsetX, this.anchorOffsetY);
                if (this.rotation !== 0) ctx.rotate(this.rotation);
                if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
                if (this.skewX !== 0 || this.skewY !== 0) {
                    ctx.transform(1, Math.tan(this.skewY), Math.tan(this.skewX), 1, 0, 0);
                }
                ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
            }
            ctx.globalAlpha *= this.opacity * this.glowOpacity;
            ctx.globalCompositeOperation = this.glowBlendMode;
            ctx.filter = `blur(${this.glowBlur}px)`;
            for (const child of this.getChildren()) child.render(ctx, config, currentTime);
            ctx.restore();
        }
    }

    setGlow(blur: number, opacity = 0.7, blendMode: GlobalCompositeOperation = 'screen'): this {
        this.glowBlur = blur;
        this.glowOpacity = opacity;
        this.glowBlendMode = blendMode;
        return this;
    }
}
