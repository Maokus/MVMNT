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
        // If metadata from SceneElement available use that to build an oriented bounds.
        const metaBase = this.baseBounds; // injected in scene-elements/base.ts
        if (!metaBase) {
            // fallback to previous simplistic behaviour
            if (this.children.length === 0) return { x: this.x, y: this.y, width: 0, height: 0 };
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const child of this.children) {
                const b = child.getBounds();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
            }
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }

        const b = metaBase; // {x,y,width,height} BEFORE element transform
        const anchorFrac = this.anchorFraction || { x: 0.5, y: 0.5 };
        const anchorX = b.x + b.width * anchorFrac.x;
        const anchorY = b.y + b.height * anchorFrac.y;

        // Build transform matrix matching render() order: translate(x,y) then translate(anchor) rotate scale skew translate(-anchor)
        // We'll compose into a 2D matrix [a c e; b d f; 0 0 1]
        const sin = Math.sin(this.rotation || 0);
        const cos = Math.cos(this.rotation || 0);
        const skewX = Math.tan(this.skewX || 0);
        const skewY = Math.tan(this.skewY || 0);
        const sx = this.scaleX || 1;
        const sy = this.scaleY || 1;

        // Start with identity then apply in order: T(x,y)*T(anchor)*R*Scale*Skew*T(-anchor)
        const multiply = (m1, m2) => ({
            a: m1.a * m2.a + m1.c * m2.b,
            b: m1.b * m2.a + m1.d * m2.b,
            c: m1.a * m2.c + m1.c * m2.d,
            d: m1.b * m2.c + m1.d * m2.d,
            e: m1.a * m2.e + m1.c * m2.f + m1.e,
            f: m1.b * m2.e + m1.d * m2.f + m1.f,
        });
        const T = (tx, ty) => ({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        const R = (cs, sn) => ({ a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 });
        const S = (sx, sy) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        const K = (kx, ky) => ({ a: 1, b: ky, c: kx, d: 1, e: 0, f: 0 }); // skew

        let M = T(this.x, this.y);
        M = multiply(M, T(anchorX, anchorY));
        M = multiply(M, R(cos, sin));
        M = multiply(M, S(sx, sy));
        M = multiply(M, K(skewX, skewY));
        M = multiply(M, T(-anchorX, -anchorY));

        // Corners of base box
        const corners = [
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x + b.width, b.y + b.height],
            [b.x, b.y + b.height],
        ];
        const txPt = (pt) => ({ x: M.a * pt[0] + M.c * pt[1] + M.e, y: M.b * pt[0] + M.d * pt[1] + M.f });
        const worldCorners = corners.map(txPt);
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of worldCorners) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        // Store corners for downstream (hit tests, handle placement along oriented edges)
        this._worldCorners = worldCorners; // [{x,y}...]
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
}
