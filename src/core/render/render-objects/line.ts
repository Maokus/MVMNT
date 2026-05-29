import { RenderObject, RenderConfig, Bounds } from './base';
import { applyShadow, clearShadow, applyDash, clearDash } from './style-helpers';

type LineCap = CanvasLineCap; // 'butt' | 'round' | 'square'

export class Line extends RenderObject {
    deltaX: number;
    deltaY: number;
    color: string;
    lineWidth: number;
    lineCap: LineCap;
    lineDash: number[];
    lineDashOffset: number;
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;

    constructor(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color = '#FFFFFF',
        lineWidth = 1,
        options?: { includeInLayoutBounds?: boolean }
    ) {
        super(x1, y1, 1, 1, 1, options);
        this.deltaX = x2 - x1;
        this.deltaY = y2 - y1;
        this.color = color;
        this.lineWidth = lineWidth;
        this.lineCap = 'butt';
        this.lineDash = [];
        this.lineDashOffset = 0;
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _time: number): void {
        applyShadow(ctx, this);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.lineCap = this.lineCap;
        applyDash(ctx, this);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.deltaX, this.deltaY);
        ctx.stroke();
        clearDash(ctx, this);
        clearShadow(ctx, this);
    }

    setEndPoint(x2: number, y2: number): this {
        this.deltaX = x2 - this.x;
        this.deltaY = y2 - this.y;
        return this;
    }
    getEndPoint(): { x: number; y: number } {
        return { x: this.x + this.deltaX, y: this.y + this.deltaY };
    }
    setDelta(deltaX: number, deltaY: number): this {
        this.deltaX = deltaX;
        this.deltaY = deltaY;
        return this;
    }
    getDelta(): { x: number; y: number } {
        return { x: this.deltaX, y: this.deltaY };
    }
    setColor(color: string): this {
        this.color = color;
        return this;
    }
    setLineWidth(width: number): this {
        this.lineWidth = Math.max(0, width);
        return this;
    }
    setLineCap(cap: LineCap): this {
        this.lineCap = cap;
        return this;
    }
    setLineDash(dash: number[]): this {
        this.lineDash = dash;
        return this;
    }

    setShadow(color: string | null, blur = 10, offsetX = 0, offsetY = 0): this {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }

    protected _getSelfBounds(): Bounds {
        // Local line from (0,0) to (dx,dy); account for stroke width
        const half = (this.lineWidth || 0) / 2;
        const minLX = Math.min(0, this.deltaX) - half;
        const minLY = Math.min(0, this.deltaY) - half;
        const maxLX = Math.max(0, this.deltaX) + half;
        const maxLY = Math.max(0, this.deltaY) + half;
        return this._computeTransformedRectBounds(minLX, minLY, maxLX - minLX, maxLY - minLY);
    }

    static createVerticalLine(x: number, y1: number, y2: number, color = '#FFFFFF', lineWidth = 1): Line {
        return new Line(x, y1, x, y2, color, lineWidth);
    }
    static createHorizontalLine(x1: number, x2: number, y: number, color = '#FFFFFF', lineWidth = 1): Line {
        return new Line(x1, y, x2, y, color, lineWidth);
    }
    static createGridLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color = 'rgba(255, 255, 255, 0.1)',
        lineWidth = 1
    ): Line {
        return new Line(x1, y1, x2, y2, color, lineWidth);
    }
    static createPlayhead(x: number, y1: number, y2: number, color = '#FF0000', lineWidth = 2): Line {
        return new Line(x, y1, x, y2, color, lineWidth);
    }
}
