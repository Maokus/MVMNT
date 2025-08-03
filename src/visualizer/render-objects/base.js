// Base RenderObject class for modular rendering system
export class RenderObject {
    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.skewX = 0; // Skew in radians
        this.skewY = 0; // Skew in radians
        this.opacity = opacity;
        this.visible = true;
        this.rotation = 0; // Rotation in radians
        this.children = []; // Array of child render objects
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

        // Apply transformations in order: translate, rotate, scale, skew
        ctx.translate(this.x, this.y);

        if (this.rotation !== 0) {
            ctx.rotate(this.rotation);
        }

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

        // Apply opacity
        if (this.opacity !== 1) {
            ctx.globalAlpha *= this.opacity;
        }

        // Call the subclass-specific rendering method
        this._renderSelf(ctx, config, currentTime);

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
     * Set skew (in radians)
     */
    setSkew(skewX, skewY) {
        this.skewX = skewX;
        this.skewY = skewY;
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
     * Add a child render object
     */
    addChild(child) {
        if (child && !this.children.includes(child)) {
            this.children.push(child);
        }
        return this;
    }

    /**
     * Remove a child render object
     */
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
        return this;
    }

    /**
     * Get all children
     */
    getChildren() {
        return this.children.slice(); // Return a copy
    }

    /**
     * Clear all children
     */
    clearChildren() {
        this.children = [];
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
}
