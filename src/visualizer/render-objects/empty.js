// Empty RenderObject that only applies transforms and renders children
import { RenderObject } from './base.js';

export class EmptyRenderObject extends RenderObject {
    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        super(x, y, scaleX, scaleY, opacity);
    }

    /**
     * Empty render method - this object only applies transforms and renders children
     * The base class render() method will handle transforms and child rendering
     */
    _renderSelf(ctx, config, currentTime) {
        // This object doesn't render anything itself, only its children
        // The base class render() method handles transforms and children
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

            // Apply this object's transform to child bounds
            // For a complete implementation, we'd need to transform all 4 corners
            // and find the new bounding box. For now, we'll use a simpler approach
            // that works for translation and uniform scaling.

            // Apply scale to dimensions
            const scaledWidth = bounds.width * this.scaleX;
            const scaledHeight = bounds.height * this.scaleY;

            // Apply position transform
            const transformedX = (bounds.x * this.scaleX) + this.x;
            const transformedY = (bounds.y * this.scaleY) + this.y;

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
