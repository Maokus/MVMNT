// Base RenderObject class for modular rendering system
export class RenderObject {
    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.opacity = opacity;
        this.visible = true;
        this.rotation = 0; // Optional rotation support
    }

    /**
     * Main render method that handles transformations and delegates to _renderSelf
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} config - Configuration object containing rendering settings
     * @param {number} currentTime - Current time for animation calculations
     */
    render(ctx, config, currentTime) {
        if (!this.visible || this.opacity <= 0) {
            return;
        }

        // Save context state
        ctx.save();

        // Apply transformations
        ctx.translate(this.x, this.y);

        if (this.rotation !== 0) {
            ctx.rotate(this.rotation);
        }

        if (this.scaleX !== 1 || this.scaleY !== 1) {
            ctx.scale(this.scaleX, this.scaleY);
        }

        if (this.opacity !== 1) {
            ctx.globalAlpha *= this.opacity;
        }

        // Call the subclass-specific rendering method
        this._renderSelf(ctx, config, currentTime);

        // Restore context state
        ctx.restore();
    }

    /**
     * Abstract method for subclasses to implement their specific drawing logic
     * Should be overridden by all subclasses
     * @param {CanvasRenderingContext2D} ctx - Canvas context (with transformations already applied)
     * @param {Object} config - Configuration object containing rendering settings
     * @param {number} currentTime - Current time for animation calculations
     */
    _renderSelf(ctx, config, currentTime) {
        throw new Error('_renderSelf method must be implemented by subclasses');
    }

    /**
     * Set position
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Set scale
     */
    setScale(scaleX, scaleY = scaleX) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        return this;
    }

    /**
     * Set opacity
     */
    setOpacity(opacity) {
        this.opacity = Math.max(0, Math.min(1, opacity));
        return this;
    }

    /**
     * Set visibility
     */
    setVisible(visible) {
        this.visible = visible;
        return this;
    }

    /**
     * Set rotation (in radians)
     */
    setRotation(rotation) {
        this.rotation = rotation;
        return this;
    }

    /**
     * Get bounding box (to be overridden by subclasses if needed)
     */
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: 0,
            height: 0
        };
    }

    /**
     * Animation helper methods
     */
    animateOpacity(targetOpacity, duration, easing = 'linear') {
        // This could be expanded to support actual animation systems
        return {
            property: 'opacity',
            target: targetOpacity,
            duration: duration,
            easing: easing
        };
    }

    animateScale(targetScaleX, targetScaleY, duration, easing = 'linear') {
        return {
            property: 'scale',
            targetX: targetScaleX,
            targetY: targetScaleY,
            duration: duration,
            easing: easing
        };
    }

    animatePosition(targetX, targetY, duration, easing = 'linear') {
        return {
            property: 'position',
            targetX: targetX,
            targetY: targetY,
            duration: duration,
            easing: easing
        };
    }
}
