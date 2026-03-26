import { RenderConfig } from './base';
import { EmptyRenderObject } from './empty';

/**
 * A container that renders its children twice:
 *   1. Normal pass — drawn as-is (via EmptyRenderObject.render).
 *   2. Glow pass — blurred and composited with a blend mode (default: 'screen').
 *
 * On a dark background, 'screen' makes bright shapes appear to emit light.
 * No offscreen buffers are required; ctx.filter handles the blur via the GPU.
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

    constructor(options?: {
        glowBlur?: number;
        glowOpacity?: number;
        glowBlendMode?: GlobalCompositeOperation;
    }) {
        super();
        this.glowBlur = options?.glowBlur ?? 8;
        this.glowOpacity = options?.glowOpacity ?? 0.7;
        this.glowBlendMode = options?.glowBlendMode ?? 'screen';
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        // Pass 1: normal render via EmptyRenderObject
        super.render(ctx, config, currentTime);

        // Pass 2: glow — same spatial transform, blur + blend mode
        if (this.glowBlur <= 0 || this.glowOpacity <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Mirror the anchor-pivot transform from EmptyRenderObject.render
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

    setGlow(blur: number, opacity = 0.7, blendMode: GlobalCompositeOperation = 'screen'): this {
        this.glowBlur = blur;
        this.glowOpacity = opacity;
        this.glowBlendMode = blendMode;
        return this;
    }
}
