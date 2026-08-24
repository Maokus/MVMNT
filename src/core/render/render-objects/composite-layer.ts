import { RenderConfig, type LayoutParticipation } from './base';
import { EmptyRenderObject } from './empty';
import { renderResourceManager } from '../render-resource-manager';

export function renderIsolatedLayer(
    ctx: CanvasRenderingContext2D,
    config: RenderConfig,
    blendMode: GlobalCompositeOperation,
    opacity: number,
    renderSource: (context: CanvasRenderingContext2D) => void
): boolean {
    const canvas = config.canvas;
    if (!canvas) return false;
    const surface = renderResourceManager.acquireScratch(canvas.width, canvas.height);
    try {
        surface.context.setTransform(ctx.getTransform());
        renderSource(surface.context);
        ctx.save();
        ctx.resetTransform();
        ctx.globalCompositeOperation = blendMode;
        if (opacity !== 1) ctx.globalAlpha *= opacity;
        ctx.drawImage(surface.canvas, 0, 0);
        ctx.restore();
        return true;
    } finally {
        surface.release();
    }
}

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

    constructor(
        layerBlendMode: GlobalCompositeOperation = 'source-over',
        options?: { layoutParticipation?: LayoutParticipation }
    ) {
        super();
        this.layerBlendMode = layerBlendMode;
        if (options?.layoutParticipation !== undefined) this.layoutParticipation = options.layoutParticipation;
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        if (!config.canvas) {
            // No canvas size info — fall back to normal (non-isolated) render
            super.render(ctx, config, currentTime);
            return;
        }

        renderIsolatedLayer(ctx, config, this.layerBlendMode, this.opacity, (offCtx) => {
            this._applyLayerTransform(offCtx);
            for (const child of this.getChildren()) child.render(offCtx, config, currentTime);
        });
    }

    setLayerBlendMode(mode: GlobalCompositeOperation): this {
        this.layerBlendMode = mode;
        return this;
    }
}
