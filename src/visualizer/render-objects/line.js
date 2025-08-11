// Line RenderObject for drawing lines and strokes
import { RenderObject } from './base.js';

export class Line extends RenderObject {
    constructor(x1, y1, x2, y2, color = '#FFFFFF', lineWidth = 1) {
        super(x1, y1);
        // Store relative vector from start to end point
        this.deltaX = x2 - x1;
        this.deltaY = y2 - y1;
        this.color = color;
        this.lineWidth = lineWidth;
        this.lineCap = 'butt'; // 'butt', 'round', 'square'
        this.lineDash = []; // For dashed lines
    }

    _renderSelf(ctx, config, currentTime) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.lineCap = this.lineCap;

        if (this.lineDash.length > 0) {
            ctx.setLineDash(this.lineDash);
        }

        ctx.beginPath();
        ctx.moveTo(0, 0); // Start point (already transformed)
        ctx.lineTo(this.deltaX, this.deltaY); // End point relative to start
        ctx.stroke();

        if (this.lineDash.length > 0) {
            ctx.setLineDash([]); // Reset line dash
        }
    }

    setEndPoint(x2, y2) {
        this.deltaX = x2 - this.x;
        this.deltaY = y2 - this.y;
        return this;
    }

    getEndPoint() {
        return {
            x: this.x + this.deltaX,
            y: this.y + this.deltaY,
        };
    }

    setDelta(deltaX, deltaY) {
        this.deltaX = deltaX;
        this.deltaY = deltaY;
        return this;
    }

    getDelta() {
        return {
            x: this.deltaX,
            y: this.deltaY,
        };
    }

    setColor(color) {
        this.color = color;
        return this;
    }

    setLineWidth(width) {
        this.lineWidth = width;
        return this;
    }

    setLineCap(cap) {
        this.lineCap = cap;
        return this;
    }

    setLineDash(dash) {
        this.lineDash = dash;
        return this;
    }

    getBounds() {
        const x2 = this.x + this.deltaX;
        const y2 = this.y + this.deltaY;
        const minX = Math.min(this.x, x2);
        const minY = Math.min(this.y, y2);
        const maxX = Math.max(this.x, x2);
        const maxY = Math.max(this.y, y2);
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    // Static helper methods for common line types
    static createVerticalLine(x, y1, y2, color = '#FFFFFF', lineWidth = 1) {
        return new Line(x, y1, x, y2, color, lineWidth);
    }

    static createHorizontalLine(x1, x2, y, color = '#FFFFFF', lineWidth = 1) {
        return new Line(x1, y, x2, y, color, lineWidth);
    }

    static createGridLine(x1, y1, x2, y2, color = 'rgba(255, 255, 255, 0.1)', lineWidth = 1) {
        return new Line(x1, y1, x2, y2, color, lineWidth);
    }

    static createPlayhead(x, y1, y2, color = '#FF0000', lineWidth = 2) {
        return new Line(x, y1, x, y2, color, lineWidth);
    }
}
