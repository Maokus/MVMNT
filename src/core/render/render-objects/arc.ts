import { RenderObject, type RenderConfig, type Bounds } from './base';
import { applyShadow, clearShadow, applyDash, clearDash } from './style-helpers';

const TAU = Math.PI * 2;

export class Arc extends RenderObject {
    radius: number;
    startAngle: number;
    endAngle: number;
    anticlockwise: boolean;
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    lineCap: CanvasLineCap;
    lineDash: number[];
    lineDashOffset: number;
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    fillRule: CanvasFillRule;
    arcFillStyle: 'segment' | 'sector';

    constructor(
        x: number,
        y: number,
        radius: number,
        startAngle = 0,
        endAngle = TAU,
        anticlockwise = false,
        options?: {
            fillColor?: string | null;
            strokeColor?: string | null;
            strokeWidth?: number;
            fillRule?: CanvasFillRule;
            includeInLayoutBounds?: boolean;
        }
    ) {
        super(x, y, 1, 1, 1, { includeInLayoutBounds: options?.includeInLayoutBounds });
        this.radius = Math.max(0, radius);
        this.startAngle = startAngle;
        this.endAngle = endAngle;
        this.anticlockwise = anticlockwise;
        this.fillColor = options?.fillColor ?? null;
        this.strokeColor = options?.strokeColor ?? '#FFFFFF';
        this.strokeWidth = options?.strokeWidth ?? 1;
        this.lineCap = 'butt';
        this.lineDash = [];
        this.lineDashOffset = 0;
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
        this.fillRule = options?.fillRule ?? 'nonzero';
        this.arcFillStyle = 'segment';
    }

    setRadius(radius: number): this {
        this.radius = Math.max(0, radius);
        return this;
    }

    setAngles(start: number, end: number, anticlockwise = this.anticlockwise): this {
        this.startAngle = start;
        this.endAngle = end;
        this.anticlockwise = anticlockwise;
        return this;
    }

    setAnticlockwise(anticlockwise: boolean): this {
        this.anticlockwise = anticlockwise;
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

    setLineCap(cap: CanvasLineCap): this {
        this.lineCap = cap;
        return this;
    }

    setLineDash(dash: number[]): this {
        this.lineDash = dash ? [...dash] : [];
        return this;
    }

    setShadow(color: string | null, blur = 10, offsetX = 0, offsetY = 0): this {
        this.shadowColor = color;
        this.shadowBlur = blur;
        this.shadowOffsetX = offsetX;
        this.shadowOffsetY = offsetY;
        return this;
    }

    setFillRule(rule: CanvasFillRule): this {
        this.fillRule = rule;
        return this;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _time: number): void {
        if (this.radius <= 0) return;
        const sweep = this.#sweepMagnitude();
        if (sweep <= 0) return;

        applyShadow(ctx, this);

        const hasStroke = !!(this.strokeColor && this.strokeWidth > 0);
        if (hasStroke) {
            ctx.strokeStyle = this.strokeColor as string;
            ctx.lineWidth = this.strokeWidth;
            ctx.lineCap = this.lineCap;
        }
        if (hasStroke) applyDash(ctx, this);

        ctx.beginPath();
        if (this.arcFillStyle === 'sector') {
            ctx.moveTo(0, 0);
        }
        ctx.arc(0, 0, this.radius, this.startAngle, this.endAngle, this.anticlockwise);
        if (this.arcFillStyle === 'sector') {
            ctx.closePath();
        }

        const doFill = !!this.fillColor;
        if (doFill) {
            ctx.fillStyle = this.fillColor as string;
            ctx.fill(this.fillRule);
        }
        if (hasStroke) ctx.stroke();

        if (hasStroke) clearDash(ctx, this);
        clearShadow(ctx, this);
    }

    protected _getSelfBounds(): Bounds {
        if (this.radius <= 0) return this._computeTransformedRectBounds(0, 0, 0, 0);
        const sweep = this.#sweepMagnitude();
        if (sweep <= 0) return this._computeTransformedRectBounds(0, 0, 0, 0);

        const isCircle = sweep >= TAU - 1e-6;
        let minX: number;
        let minY: number;
        let maxX: number;
        let maxY: number;

        if (isCircle) {
            minX = -this.radius;
            minY = -this.radius;
            maxX = this.radius;
            maxY = this.radius;
        } else {
            const points: Array<{ x: number; y: number }> = [];
            const pushAngle = (angle: number) => {
                points.push({ x: this.radius * Math.cos(angle), y: this.radius * Math.sin(angle) });
            };
            pushAngle(this.startAngle);
            pushAngle(this.endAngle);

            for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
                if (Arc.#angleWithinArc(angle, this.startAngle, this.endAngle, this.anticlockwise)) pushAngle(angle);
            }
            if (this.fillColor) points.push({ x: 0, y: 0 });

            minX = Infinity;
            minY = Infinity;
            maxX = -Infinity;
            maxY = -Infinity;
            for (const pt of points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }
            if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
                minX = -this.radius;
                minY = -this.radius;
                maxX = this.radius;
                maxY = this.radius;
            }
        }

        const strokePad = this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth / 2 : 0;
        if (strokePad) {
            minX -= strokePad;
            minY -= strokePad;
            maxX += strokePad;
            maxY += strokePad;
        }

        return this._computeTransformedRectBounds(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY));
    }

    static #normalizeAngle(angle: number): number {
        const result = angle % TAU;
        return result < 0 ? result + TAU : result;
    }

    static #angleWithinArc(target: number, start: number, end: number, anticlockwise: boolean): boolean {
        const sweep = Arc.#sweepMagnitudeStatic(start, end, anticlockwise);
        if (sweep >= TAU - 1e-6) return true;
        let normStart = Arc.#normalizeAngle(start);
        let normEnd = Arc.#normalizeAngle(end);
        let normTarget = Arc.#normalizeAngle(target);
        if (!anticlockwise) {
            if (normEnd < normStart) normEnd += TAU;
            if (normTarget < normStart) normTarget += TAU;
            return normTarget >= normStart && normTarget <= normEnd;
        }
        if (normStart < normEnd) normStart += TAU;
        if (normTarget > normStart) normTarget -= TAU;
        return normTarget <= normStart && normTarget >= normEnd;
    }

    #sweepMagnitude(): number {
        return Arc.#sweepMagnitudeStatic(this.startAngle, this.endAngle, this.anticlockwise);
    }

    static #sweepMagnitudeStatic(start: number, end: number, anticlockwise: boolean): number {
        let sweep = end - start;
        if (!anticlockwise) {
            while (sweep < 0) sweep += TAU;
        } else {
            while (sweep > 0) sweep -= TAU;
            sweep = -sweep;
        }
        return Math.min(Math.abs(sweep), TAU);
    }
}
