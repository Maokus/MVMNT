import { RenderConfig, type LayoutParticipation } from './base';
import { EmptyRenderObject } from './empty';

/**
 * A container that renders its children into an isolated OffscreenCanvas, then
 * composites the result onto the main canvas with a configurable blend mode.
 *
 * Unlike GlowLayer (which draws children twice), CompositeLayer draws children
 * once into a separate buffer. This is required for effects that need the group
 * to be evaluated as a unit before blending, such as:
 *   - 'destination-in' masking (another shape punches a hole through the group)
 *   - 'multiply' where children must not multiply against each other
 *   - Any effect where the group must be isolated from the main canvas during rendering
 *
 * The layer's accumulated transform is automatically propagated to the offscreen
 * context via ctx.getTransform(), so children render in correct world-space positions.
 *
 * Usage:
 *   const layer = new CompositeLayer('screen');
 *   shapes.forEach(s => layer.addChild(s));
 *   return [layer];
 */
export class CompositeLayer extends EmptyRenderObject {
    layerBlendMode: GlobalCompositeOperation;

    constructor(layerBlendMode: GlobalCompositeOperation = 'source-over', options?: { layoutParticipation?: LayoutParticipation }) {
        super();
        this.layerBlendMode = layerBlendMode;
        if (options?.layoutParticipation !== undefined) this.layoutParticipation = options.layoutParticipation;
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        const canvas = config.canvas;
        if (!canvas) {
            // No canvas size info — fall back to normal (non-isolated) render
            super.render(ctx, config, currentTime);
            return;
        }

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const offCtx = offscreen.getContext('2d')!;

        // Copy the main context's accumulated transform so children land in the
        // same world-space positions as they would on the main canvas.
        offCtx.setTransform(ctx.getTransform());

        // Apply this layer's own spatial transform to the offscreen context,
        // mirroring the anchor-pivot logic in EmptyRenderObject.render.
        this._applyLayerTransform(offCtx as unknown as CanvasRenderingContext2D);

        // Render children into the isolated buffer at full opacity.
        // Layer opacity is applied when compositing the buffer onto the main canvas.
        for (const child of this.getChildren())
            child.render(offCtx as unknown as CanvasRenderingContext2D, config, currentTime);

        // Composite the isolated layer onto the main canvas.
        // Reset the transform so drawImage maps 1:1 to canvas pixels.
        ctx.save();
        ctx.resetTransform();
        ctx.globalCompositeOperation = this.layerBlendMode;
        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;
        ctx.drawImage(offscreen, 0, 0);
        ctx.restore();
    }

    setLayerBlendMode(mode: GlobalCompositeOperation): this {
        this.layerBlendMode = mode;
        return this;
    }
}
