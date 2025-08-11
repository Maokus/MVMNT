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
     * Set anchor visualization data for debugging
     */
    setAnchorVisualizationData(bounds, anchorX, anchorY) {
        this.anchorVisualizationData = {
            bounds,
            anchorX,
            anchorY,
        };
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
                    1,
                    Math.tan(this.skewY), // skewY affects how Y coordinates map to X
                    Math.tan(this.skewX),
                    1, // skewX affects how X coordinates map to Y
                    0,
                    0,
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

        // Render anchor visualization if enabled and we have the data
        if (config.showAnchorPoints && this.anchorVisualizationData) {
            this.renderAnchorVisualization(
                ctx,
                this.anchorVisualizationData.bounds,
                this.anchorVisualizationData.anchorX,
                this.anchorVisualizationData.anchorY
            );
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
     * Render anchor point visualization for debugging
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} bounds - Bounds of the scene element
     * @param {number} anchorX - Anchor X position (0-1)
     * @param {number} anchorY - Anchor Y position (0-1)
     */
    renderAnchorVisualization(ctx, bounds, anchorX, anchorY) {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

        // Calculate anchor point in pixel coordinates
        const anchorPixelX = bounds.x + bounds.width * anchorX;
        const anchorPixelY = bounds.y + bounds.height * anchorY;

        // Save context state
        ctx.save();

        // Draw bounding box outline
        ctx.strokeStyle = '#00FFFF'; // Cyan color for bounds
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); // Dashed line
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // Draw cross lines through anchor point
        ctx.setLineDash([]); // Solid line
        ctx.strokeStyle = '#FFFF00'; // Yellow color for anchor lines
        ctx.lineWidth = 2;

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(bounds.x, anchorPixelY);
        ctx.lineTo(bounds.x + bounds.width, anchorPixelY);
        ctx.stroke();

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(anchorPixelX, bounds.y);
        ctx.lineTo(anchorPixelX, bounds.y + bounds.height);
        ctx.stroke();

        // Draw anchor point marker
        ctx.fillStyle = '#FFFF00'; // Yellow color for anchor marker
        ctx.fillRect(anchorPixelX - 5, anchorPixelY - 5, 10, 10);

        // Draw anchor coordinates text
        ctx.fillStyle = '#FFFFFF'; // White color for text
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const text = `Anchor: (${anchorX.toFixed(2)}, ${anchorY.toFixed(2)})`;

        // Add background for text readability
        const textMetrics = ctx.measureText(text);
        const textX = anchorPixelX + 15;
        const textY = anchorPixelY - 15;
        const textWidth = textMetrics.width;
        const textHeight = 14;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black background
        ctx.fillRect(textX - 2, textY - 2, textWidth + 4, textHeight + 4);

        ctx.fillStyle = '#FFFFFF'; // White text
        ctx.fillText(text, textX, textY);

        // Restore context state
        ctx.restore();
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
            const transformedX = (bounds.x - this.anchorOffsetX) * this.scaleX + this.x + this.anchorOffsetX;
            const transformedY = (bounds.y - this.anchorOffsetY) * this.scaleY + this.y + this.anchorOffsetY;

            minX = Math.min(minX, transformedX);
            minY = Math.min(minY, transformedY);
            maxX = Math.max(maxX, transformedX + scaledWidth);
            maxY = Math.max(maxY, transformedY + scaledHeight);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }
}
