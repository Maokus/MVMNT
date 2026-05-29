import { RenderConfig } from './base';
import { EmptyRenderObject } from './empty';

/**
 * A container that clips its children to a rectangular region before rendering them.
 *
 * Children are drawn normally, but anything outside the clip rect is masked.
 * The clip rect is in local space (origin 0,0 with given width/height).
 *
 * Usage:
 *   const clip = new ClipLayer(width, height);
 *   tiles.forEach(t => clip.addChild(t));
 *   return [clip];
 */
export class ClipLayer extends EmptyRenderObject {
    clipWidth: number;
    clipHeight: number;

    constructor(clipWidth: number, clipHeight: number) {
        super();
        this.clipWidth = clipWidth;
        this.clipHeight = clipHeight;
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        ctx.save();
        this._applyLayerTransform(ctx);

        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;
        if (this.blendMode) ctx.globalCompositeOperation = this.blendMode;
        if (this.filter) ctx.filter = this.filter;

        // Clip to the rect before drawing children
        ctx.beginPath();
        ctx.rect(0, 0, this.clipWidth, this.clipHeight);
        ctx.clip();

        for (const child of this.getChildren()) child.render(ctx, config, currentTime);

        ctx.restore();
    }

    setClipSize(width: number, height: number): this {
        this.clipWidth = width;
        this.clipHeight = height;
        return this;
    }
}
