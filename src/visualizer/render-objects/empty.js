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
     * Calculate bounds based on children
     */
    getBounds() {
        console.log('Calculating bounds for EmptyRenderObject with children:', this.children.length);

        if (this.children.length === 0) {
            return { x: this.x, y: this.y, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const child of this.children) {
            const bounds = child.getBounds();
            console.log(`Child bounds: ${JSON.stringify(bounds)}`);
            // Transform child bounds by this object's transform
            // For simplicity, we'll use the child bounds as-is
            // In a more complete implementation, you'd apply the transforms
            minX = Math.min(minX, bounds.x + this.x);
            minY = Math.min(minY, bounds.y + this.y);
            maxX = Math.max(maxX, bounds.x + bounds.width + this.x);
            maxY = Math.max(maxY, bounds.y + bounds.height + this.y);
        }

        console.log(`Calculated bounds: { x: ${minX}, y: ${minY}, width: ${maxX - minX}, height: ${maxY - minY} }`);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
}
