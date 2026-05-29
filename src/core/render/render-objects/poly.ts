import { RenderObject, RenderConfig, Bounds, type LayoutParticipation } from './base';
import { applyShadow, clearShadow, applyDash, clearDash } from './style-helpers';

interface Point {
    x: number;
    y: number;
}

export interface PolyOptions {
    fillColor?: string | null;
    strokeColor?: string | null;
    strokeWidth?: number;
    layoutParticipation?: LayoutParticipation;
    /** @deprecated compatibility only. Use layoutParticipation. */
    includeInLayoutBounds?: boolean;
}

export class Poly extends RenderObject {
    points: Point[];
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    closed: boolean;
    lineJoin: CanvasLineJoin;
    lineCap: CanvasLineCap;
    miterLimit: number;
    lineDash: number[];
    lineDashOffset: number;
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;

    constructor(points?: unknown, options?: PolyOptions);
    /** @deprecated Use Poly(points, options) instead. */
    constructor(
        points: unknown,
        fillColor: string | null,
        strokeColor: string | null,
        strokeWidth: number,
        options?: { layoutParticipation?: LayoutParticipation; includeInLayoutBounds?: boolean }
    );
    constructor(
        points: unknown = [],
        fillColorOrOptions?: string | null | PolyOptions,
        strokeColor?: string | null,
        strokeWidth?: number,
        legacyOptions?: { layoutParticipation?: LayoutParticipation; includeInLayoutBounds?: boolean }
    ) {
        let opts: PolyOptions;
        if (typeof fillColorOrOptions === 'string' || fillColorOrOptions === null) {
            opts = {
                fillColor: fillColorOrOptions,
                strokeColor: strokeColor ?? '#FFFFFF',
                strokeWidth: strokeWidth ?? 1,
                ...legacyOptions,
            };
        } else {
            opts = fillColorOrOptions ?? {};
        }
        super(0, 0, 1, 1, 1, opts);
        this.points = this.#normalizePoints(points);
        this.fillColor = opts.fillColor ?? null;
        this.strokeColor = opts.strokeColor ?? '#FFFFFF';
        this.strokeWidth = opts.strokeWidth ?? 1;
        this.closed = true;
        this.lineJoin = 'miter';
        this.lineCap = 'butt';
        this.miterLimit = 10;
        this.lineDash = [];
        this.lineDashOffset = 0;
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
    }

    #normalizePoints(raw: unknown): Point[] {
        if (!raw || !Array.isArray(raw)) return [];
        if (raw.length && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
            return (raw as any[]).map((p) => ({ x: +p.x || 0, y: +p.y || 0 }));
        }
        if (raw.length && typeof raw[0] === 'number') {
            const pts: Point[] = [];
            const arr = raw as number[];
            for (let i = 0; i < arr.length; i += 2) pts.push({ x: +arr[i] || 0, y: +arr[i + 1] || 0 });
            return pts;
        }
        if (raw.length && Array.isArray(raw[0])) {
            return (raw as any[]).map((p) => ({ x: +p[0] || 0, y: +p[1] || 0 }));
        }
        return [];
    }

    setPoints(points: unknown): this {
        this.points = this.#normalizePoints(points);
        return this;
    }
    addPoint(x: number, y: number): this {
        this.points.push({ x, y });
        return this;
    }
    clearPoints(): this {
        this.points = [];
        return this;
    }
    setFill(color: string | null): this {
        this.fillColor = color;
        return this;
    }
    /** @deprecated Use setFill(). */
    setFillColor(color: string | null): this {
        return this.setFill(color);
    }
    setStroke(color: string | null, width = this.strokeWidth): this {
        this.strokeColor = color;
        this.strokeWidth = Math.max(0, width);
        return this;
    }
    setClosed(closed: boolean): this {
        this.closed = closed;
        return this;
    }
    setLineJoin(join: CanvasLineJoin): this {
        this.lineJoin = join;
        return this;
    }
    setLineCap(cap: CanvasLineCap): this {
        this.lineCap = cap;
        return this;
    }
    setMiterLimit(limit: number): this {
        this.miterLimit = limit;
        return this;
    }
    setLineDash(dash: number[]): this {
        this.lineDash = dash || [];
        return this;
    }
    setShadow(color: string | null, blur = 10, offsetX = 0, offsetY = 0): this {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }
    protected _renderSelf(ctx: CanvasRenderingContext2D): void {
        if (this.points.length < 2) return;
        applyShadow(ctx, this);
        ctx.beginPath();
        const first = this.points[0];
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
        if (this.closed) ctx.closePath();
        const hasStroke = !!(this.strokeColor && this.strokeWidth > 0);
        if (hasStroke) {
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeStyle = this.strokeColor as string;
            ctx.lineJoin = this.lineJoin;
            ctx.lineCap = this.lineCap;
            ctx.miterLimit = this.miterLimit;
            applyDash(ctx, this);
        }
        const doFill = this.closed && this.fillColor;
        if (doFill) {
            ctx.fillStyle = this.fillColor as string;
            if (hasStroke) {
                ctx.fill();
                ctx.stroke();
            } else ctx.fill();
        } else if (hasStroke) ctx.stroke();
        if (hasStroke) clearDash(ctx, this);
        clearShadow(ctx, this);
    }

    protected _getSelfBounds(): Bounds {
        if (!this.points.length) return this._computeTransformedRectBounds(0, 0, 0, 0);
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
        // Account for stroke width
        const half = (this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth : 0) / 2;
        minX -= half;
        minY -= half;
        maxX += half;
        maxY += half;
        return this._computeTransformedRectBounds(minX, minY, maxX - minX, maxY - minY);
    }
}
