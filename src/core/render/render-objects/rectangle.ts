import { BoxRenderObject } from './box';
import { type RenderConfig, type Bounds } from './base';
import { applyShadow, clearShadow, applyDash, clearDash } from './style-helpers';

export class Rectangle extends BoxRenderObject {
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    cornerRadius: number;
    lineDash: number[];
    lineDashOffset: number;
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: string | null = '#FFFFFF',
        strokeColor: string | null = null,
        strokeWidth = 1,
        options?: { includeInLayoutBounds?: boolean }
    ) {
        const maxPosition = 1_000_000;
        const maxSize = 1_000_000;
        const clampedX = Math.max(-maxPosition, Math.min(maxPosition, x));
        const clampedY = Math.max(-maxPosition, Math.min(maxPosition, y));
        const clampedWidth = Math.max(0, Math.min(maxSize, width));
        const clampedHeight = Math.max(0, Math.min(maxSize, height));
        if (clampedX !== x || clampedY !== y || clampedWidth !== width || clampedHeight !== height) {
            console.warn(
                `Rectangle constructor: Extreme values clamped - original: (${x}, ${y}, ${width}, ${height}), clamped: (${clampedX}, ${clampedY}, ${clampedWidth}, ${clampedHeight})`
            );
        }
        super(clampedX, clampedY, clampedWidth, clampedHeight, options);
        this.fillColor = fillColor;
        this.strokeColor = strokeColor;
        this.strokeWidth = strokeWidth;
        this.cornerRadius = 0;
        this.lineDash = [];
        this.lineDashOffset = 0;
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        applyShadow(ctx, this);

        if (this.cornerRadius > 0) this.#drawRoundedRect(ctx);
        else this.#drawRect(ctx);

        clearDash(ctx, this);
        clearShadow(ctx, this);
    }

    #drawRect(ctx: CanvasRenderingContext2D): void {
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.fillRect(0, 0, this.width, this.height);
        }
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            applyDash(ctx, this);
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.stroke();
        }
    }

    #drawRoundedRect(ctx: CanvasRenderingContext2D): void {
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
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.fill();
        }
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            applyDash(ctx, this);
            ctx.stroke();
        }
    }

    setFill(color: string | null): this {
        this.fillColor = color;
        return this;
    }
    /** @deprecated Use setFill(). */
    setFillColor(color: string | null): this {
        return this.setFill(color);
    }
    setStroke(color: string | null, width = 1): this {
        this.strokeColor = color;
        this.strokeWidth = Math.max(0, width);
        return this;
    }
    setCornerRadius(radius: number): this {
        this.cornerRadius = radius;
        return this;
    }
    setShadow(color: string | null, blur = 10, offsetX = 0, offsetY = 0): this {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }
    protected override _getSelfBounds(): Bounds {
        // Local rect is at (0,0) with width/height; pad for stroke if any
        let lx = 0,
            ly = 0,
            w = this.width,
            h = this.height;
        const strokePad = this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth : 0;
        if (strokePad) {
            lx -= strokePad / 2;
            ly -= strokePad / 2;
            w += strokePad;
            h += strokePad;
        }
        return this._computeTransformedRectBounds(lx, ly, w, h);
    }
}
