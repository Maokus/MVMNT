// Polygon (Poly) RenderObject for drawing arbitrary polygons defined by points
// Supports fill, stroke, dash, shadows, and open/closed shapes.
// Points input forms accepted:
//   - Array of {x, y}
//   - Flat number array: [x1, y1, x2, y2, ...]
//   - Array of [x, y]
import { RenderObject } from './base.js';

export class Poly extends RenderObject {
    constructor(points = [], fillColor = null, strokeColor = '#FFFFFF', strokeWidth = 1) {
        super(0, 0);
        this.points = this._normalizePoints(points);
        this.fillColor = fillColor;
        this.strokeColor = strokeColor;
        this.strokeWidth = strokeWidth;
        this.closed = true; // Close path & allow fill
        this.lineJoin = 'miter';
        this.lineCap = 'butt';
        this.miterLimit = 10;
        this.lineDash = [];
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
        this.globalAlpha = 1;
    }

    _normalizePoints(raw) {
        if (!raw) return [];
        if (raw.length && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
            return raw.map((p) => ({ x: +p.x || 0, y: +p.y || 0 }));
        }
        if (raw.length && typeof raw[0] === 'number') {
            const pts = [];
            for (let i = 0; i < raw.length; i += 2) {
                pts.push({ x: +raw[i] || 0, y: +raw[i + 1] || 0 });
            }
            return pts;
        }
        if (raw.length && Array.isArray(raw[0])) {
            return raw.map((p) => ({ x: +p[0] || 0, y: +p[1] || 0 }));
        }
        return [];
    }

    setPoints(points) {
        this.points = this._normalizePoints(points);
        return this;
    }
    addPoint(x, y) {
        this.points.push({ x, y });
        return this;
    }
    clearPoints() {
        this.points = [];
        return this;
    }
    setFillColor(color) {
        this.fillColor = color;
        return this;
    }
    setStroke(color, width = this.strokeWidth) {
        this.strokeColor = color;
        this.strokeWidth = width;
        return this;
    }
    setClosed(closed) {
        this.closed = closed;
        return this;
    }
    setLineJoin(join) {
        this.lineJoin = join;
        return this;
    }
    setLineCap(cap) {
        this.lineCap = cap;
        return this;
    }
    setMiterLimit(limit) {
        this.miterLimit = limit;
        return this;
    }
    setLineDash(dash) {
        this.lineDash = dash || [];
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

    _renderSelf(ctx, config, currentTime) {
        if (this.points.length < 2) return;

        const originalAlpha = ctx.globalAlpha;
        if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha * this.globalAlpha;

        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = this.shadowColor;
            ctx.shadowBlur = this.shadowBlur;
            ctx.shadowOffsetX = this.shadowOffsetX;
            ctx.shadowOffsetY = this.shadowOffsetY;
        }

        ctx.beginPath();
        const first = this.points[0];
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < this.points.length; i++) {
            const p = this.points[i];
            ctx.lineTo(p.x, p.y);
        }
        if (this.closed) ctx.closePath();

        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeStyle = this.strokeColor;
            ctx.lineJoin = this.lineJoin;
            ctx.lineCap = this.lineCap;
            ctx.miterLimit = this.miterLimit;
            if (this.lineDash.length) ctx.setLineDash(this.lineDash);
        }

        const doFill = this.closed && this.fillColor;
        if (doFill) {
            ctx.fillStyle = this.fillColor;
            if (this.strokeColor && this.strokeWidth > 0) {
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fill();
            }
        } else if (this.strokeColor && this.strokeWidth > 0) {
            ctx.stroke();
        }

        if (this.lineDash.length) ctx.setLineDash([]);
        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha;
    }

    getBounds() {
        if (!this.points.length) return { x: this.x, y: this.y, width: 0, height: 0 };
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of this.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: this.x + minX, y: this.y + minY, width: maxX - minX, height: maxY - minY };
    }
}
