// Rectangle RenderObject for drawing simple rectangles
import { RenderObject } from './base.js';

export class Rectangle extends RenderObject {
    constructor(x, y, width, height, fillColor = '#FFFFFF', strokeColor = null, strokeWidth = 1) {
        // Validate and clamp extreme values
        const maxPosition = 1000000;
        const maxSize = 1000000;

        const clampedX = Math.max(-maxPosition, Math.min(maxPosition, x));
        const clampedY = Math.max(-maxPosition, Math.min(maxPosition, y));
        const clampedWidth = Math.max(0, Math.min(maxSize, width));
        const clampedHeight = Math.max(0, Math.min(maxSize, height));

        if (clampedX !== x || clampedY !== y || clampedWidth !== width || clampedHeight !== height) {
            console.warn(`Rectangle constructor: Extreme values clamped - original: (${x}, ${y}, ${width}, ${height}), clamped: (${clampedX}, ${clampedY}, ${clampedWidth}, ${clampedHeight})`);
        }

        super(clampedX, clampedY);
        this.width = clampedWidth;
        this.height = clampedHeight;
        this.fillColor = fillColor;
        this.strokeColor = strokeColor;
        this.strokeWidth = strokeWidth;
        this.cornerRadius = 0; // For rounded rectangles

        // Shadow properties for glow effects
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;

        // Additional alpha control (separate from base opacity)
        this.globalAlpha = 1;
    }

    _renderSelf(ctx, config, currentTime) {
        // Apply shadow if set
        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = this.shadowColor;
            ctx.shadowBlur = this.shadowBlur;
            ctx.shadowOffsetX = this.shadowOffsetX;
            ctx.shadowOffsetY = this.shadowOffsetY;
        }

        // Apply additional alpha
        if (this.globalAlpha !== 1) {
            ctx.globalAlpha *= this.globalAlpha;
        }

        if (this.cornerRadius > 0) {
            this._drawRoundedRect(ctx);
        } else {
            this._drawRect(ctx);
        }

        // Reset shadow after drawing
        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
    }

    _drawRect(ctx) {
        // Fill
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Stroke
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeRect(0, 0, this.width, this.height);
        }
    }

    _drawRoundedRect(ctx) {
        const radius = this.cornerRadius;
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(this.width - radius, 0);
        ctx.quadraticCurveTo(this.width, 0, this.width, radius);
        ctx.lineTo(this.width, this.height - radius);
        ctx.quadraticCurveTo(this.width, this.height, this.width - radius, this.height);
        ctx.lineTo(radius, this.height);
        ctx.quadraticCurveTo(0, this.height, 0, this.height - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();

        // Fill
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.fill();
        }

        // Stroke
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            ctx.stroke();
        }
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        return this;
    }

    setFillColor(color) {
        this.fillColor = color;
        return this;
    }

    setStroke(color, width = 1) {
        this.strokeColor = color;
        this.strokeWidth = width;
        return this;
    }

    setCornerRadius(radius) {
        this.cornerRadius = radius;
        return this;
    }

    setShadow(color, blur = 10, offsetX = 0, offsetY = 0) {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }

    setGlobalAlpha(alpha) {
        this.globalAlpha = Math.max(0, Math.min(1, alpha));
        return this;
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
