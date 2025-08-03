// Empty RenderObject that only applies transforms and renders children
import { RenderObject } from './base.js';

export class EmptyRenderObject extends RenderObject {
    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        super(x, y, scaleX, scaleY, opacity);
        // Store anchor point for proper rotation behavior
        this.anchorOffsetX = 0;
        this.anchorOffsetY = 0;
    }

    /**
     * Set anchor offset for proper rotation center
     */
    setAnchorOffset(anchorOffsetX, anchorOffsetY) {
        this.anchorOffsetX = anchorOffsetX;
        this.anchorOffsetY = anchorOffsetY;
        return this;
    }

    /**
     * Override render method to handle anchor-based transforms properly
     */
    render(ctx, config, currentTime) {
        if (!this.visible || this.opacity <= 0) {
            return;
        }

        // Save context state
        ctx.save();

        // Apply transformations with anchor point consideration
        // First translate to position
        ctx.translate(this.x, this.y);

        // If we have rotation/scale/skew, we need to handle anchor point
        if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
            // Translate to anchor point
            ctx.translate(this.anchorOffsetX, this.anchorOffsetY);

            // Apply rotation around anchor
            if (this.rotation !== 0) {
                ctx.rotate(this.rotation);
            }

            // Apply scaling around anchor
            if (this.scaleX !== 1 || this.scaleY !== 1) {
                ctx.scale(this.scaleX, this.scaleY);
            }

            // Apply skew transformation using transform matrix
            if (this.skewX !== 0 || this.skewY !== 0) {
                const transform = [
                    1, Math.tan(this.skewY), // skewY affects how Y coordinates map to X
                    Math.tan(this.skewX), 1, // skewX affects how X coordinates map to Y
                    0, 0
                ];
                ctx.transform(...transform);
            }

            // Translate back from anchor point
            ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
        }

        // Apply opacity
        if (this.opacity !== 1) {
            ctx.globalAlpha *= this.opacity;
        }

        // Render all children with the current transform context
        for (const child of this.children) {
            if (child && typeof child.render === 'function') {
                child.render(ctx, config, currentTime);
            }
        }

        // Restore context state
        ctx.restore();
    }

    /**
     * Empty render method - this object only applies transforms and renders children
     * The overridden render() method handles everything
     */
    _renderSelf(ctx, config, currentTime) {
        // This object doesn't render anything itself, only its children
    }

    /**
     * Calculate bounds based on children with proper transform application
     */
    getBounds() {
        if (this.children.length === 0) {
            return { x: this.x, y: this.y, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const child of this.children) {
            const bounds = child.getBounds();

            // For a complete implementation, we'd need to transform all 4 corners
            // and find the new bounding box. For now, we'll use a simpler approach
            // that works for translation and uniform scaling.

            // Apply scale to dimensions
            const scaledWidth = bounds.width * this.scaleX;
            const scaledHeight = bounds.height * this.scaleY;

            // Apply position transform - taking into account anchor offset
            const transformedX = ((bounds.x - this.anchorOffsetX) * this.scaleX) + this.x + this.anchorOffsetX;
            const transformedY = ((bounds.y - this.anchorOffsetY) * this.scaleY) + this.y + this.anchorOffsetY;

            minX = Math.min(minX, transformedX);
            minY = Math.min(minY, transformedY);
            maxX = Math.max(maxX, transformedX + scaledWidth);
            maxY = Math.max(maxY, transformedY + scaledHeight);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
}
