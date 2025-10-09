import { RenderObject, type RenderConfig, type Bounds } from './base';

export type BezierPathCommand =
    | { type: 'moveTo'; x: number; y: number }
    | { type: 'lineTo'; x: number; y: number }
    | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
    | { type: 'bezierCurveTo'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
    | { type: 'closePath' };

interface Point {
    x: number;
    y: number;
}

function cloneCommand(cmd: BezierPathCommand): BezierPathCommand {
    switch (cmd.type) {
        case 'moveTo':
        case 'lineTo':
            return { type: cmd.type, x: cmd.x, y: cmd.y };
        case 'quadraticCurveTo':
            return { type: cmd.type, cpx: cmd.cpx, cpy: cmd.cpy, x: cmd.x, y: cmd.y };
        case 'bezierCurveTo':
            return {
                type: cmd.type,
                cp1x: cmd.cp1x,
                cp1y: cmd.cp1y,
                cp2x: cmd.cp2x,
                cp2y: cmd.cp2y,
                x: cmd.x,
                y: cmd.y,
            };
        case 'closePath':
        default:
            return { type: 'closePath' };
    }
}

export class BezierPath extends RenderObject {
    private commands: BezierPathCommand[];
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    lineJoin: CanvasLineJoin;
    lineCap: CanvasLineCap;
    miterLimit: number;
    lineDash: number[];
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    globalAlpha: number;
    fillRule: CanvasFillRule;

    constructor(
        x = 0,
        y = 0,
        commands: BezierPathCommand[] = [],
        options?: {
            fillColor?: string | null;
            strokeColor?: string | null;
            strokeWidth?: number;
            fillRule?: CanvasFillRule;
            includeInLayoutBounds?: boolean;
        }
    ) {
        super(x, y, 1, 1, 1, { includeInLayoutBounds: options?.includeInLayoutBounds });
        this.commands = commands.map(cloneCommand);
        this.fillColor = options?.fillColor ?? null;
        this.strokeColor = options?.strokeColor ?? '#FFFFFF';
        this.strokeWidth = options?.strokeWidth ?? 1;
        this.lineJoin = 'miter';
        this.lineCap = 'butt';
        this.miterLimit = 10;
        this.lineDash = [];
        this.shadowColor = null;
        this.shadowBlur = 0;
        this.shadowOffsetX = 0;
        this.shadowOffsetY = 0;
        this.globalAlpha = 1;
        this.fillRule = options?.fillRule ?? 'nonzero';
    }

    setCommands(commands: BezierPathCommand[]): this {
        this.commands = commands.map(cloneCommand);
        return this;
    }

    getCommands(): BezierPathCommand[] {
        return this.commands.map(cloneCommand);
    }

    clear(): this {
        this.commands = [];
        return this;
    }

    moveTo(x: number, y: number): this {
        this.commands.push({ type: 'moveTo', x, y });
        return this;
    }

    lineTo(x: number, y: number): this {
        this.commands.push({ type: 'lineTo', x, y });
        return this;
    }

    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): this {
        this.commands.push({ type: 'quadraticCurveTo', cpx, cpy, x, y });
        return this;
    }

    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
        this.commands.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
        return this;
    }

    closePath(): this {
        this.commands.push({ type: 'closePath' });
        return this;
    }

    setFillColor(color: string | null): this {
        this.fillColor = color;
        return this;
    }

    setStroke(color: string | null, width = this.strokeWidth): this {
        this.strokeColor = color;
        this.strokeWidth = width;
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

    setGlobalAlpha(alpha: number): this {
        this.globalAlpha = Math.max(0, Math.min(1, alpha));
        return this;
    }

    setFillRule(rule: CanvasFillRule): this {
        this.fillRule = rule;
        return this;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _time: number): void {
        if (!this.commands.length) return;
        const originalAlpha = ctx.globalAlpha;
        if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha * this.globalAlpha;
        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = this.shadowColor;
            ctx.shadowBlur = this.shadowBlur;
            ctx.shadowOffsetX = this.shadowOffsetX;
            ctx.shadowOffsetY = this.shadowOffsetY;
        }
        const hasStroke = !!(this.strokeColor && this.strokeWidth > 0);
        if (hasStroke) {
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeStyle = this.strokeColor as string;
            ctx.lineJoin = this.lineJoin;
            ctx.lineCap = this.lineCap;
            ctx.miterLimit = this.miterLimit;
        }
        if (this.lineDash.length && hasStroke) ctx.setLineDash(this.lineDash);

        ctx.beginPath();
        let current: Point = { x: 0, y: 0 };
        let subpathStart: Point = { x: 0, y: 0 };
        for (const command of this.commands) {
            switch (command.type) {
                case 'moveTo':
                    ctx.moveTo(command.x, command.y);
                    current = { x: command.x, y: command.y };
                    subpathStart = { ...current };
                    break;
                case 'lineTo':
                    ctx.lineTo(command.x, command.y);
                    current = { x: command.x, y: command.y };
                    break;
                case 'quadraticCurveTo':
                    ctx.quadraticCurveTo(command.cpx, command.cpy, command.x, command.y);
                    current = { x: command.x, y: command.y };
                    break;
                case 'bezierCurveTo':
                    ctx.bezierCurveTo(command.cp1x, command.cp1y, command.cp2x, command.cp2y, command.x, command.y);
                    current = { x: command.x, y: command.y };
                    break;
                case 'closePath':
                    ctx.closePath();
                    current = { ...subpathStart };
                    break;
                default:
                    break;
            }
        }

        const doFill = !!this.fillColor;
        if (doFill) {
            ctx.fillStyle = this.fillColor as string;
            ctx.fill(this.fillRule);
        }
        if (hasStroke) ctx.stroke();

        if (this.lineDash.length && hasStroke) ctx.setLineDash([]);
        if (this.shadowColor && this.shadowBlur > 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha;
    }

    protected _getSelfBounds(): Bounds {
        if (!this.commands.length) return this._computeTransformedRectBounds(0, 0, 0, 0);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let current: Point = { x: 0, y: 0 };
        let subpathStart: Point = { x: 0, y: 0 };
        let hasGeometry = false;

        const extend = (x: number, y: number) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            hasGeometry = true;
        };

        const extendBounds = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
            extend(bounds.minX, bounds.minY);
            extend(bounds.minX, bounds.maxY);
            extend(bounds.maxX, bounds.minY);
            extend(bounds.maxX, bounds.maxY);
        };

        for (const command of this.commands) {
            switch (command.type) {
                case 'moveTo':
                    extend(command.x, command.y);
                    current = { x: command.x, y: command.y };
                    subpathStart = { ...current };
                    break;
                case 'lineTo': {
                    extend(current.x, current.y);
                    extend(command.x, command.y);
                    current = { x: command.x, y: command.y };
                    break;
                }
                case 'quadraticCurveTo': {
                    const bounds = BezierPath.#quadraticBounds(current, { x: command.cpx, y: command.cpy }, {
                        x: command.x,
                        y: command.y,
                    });
                    extendBounds(bounds);
                    current = { x: command.x, y: command.y };
                    break;
                }
                case 'bezierCurveTo': {
                    const bounds = BezierPath.#cubicBounds(
                        current,
                        { x: command.cp1x, y: command.cp1y },
                        { x: command.cp2x, y: command.cp2y },
                        { x: command.x, y: command.y }
                    );
                    extendBounds(bounds);
                    current = { x: command.x, y: command.y };
                    break;
                }
                case 'closePath': {
                    extend(current.x, current.y);
                    extend(subpathStart.x, subpathStart.y);
                    current = { ...subpathStart };
                    break;
                }
                default:
                    break;
            }
        }

        if (!hasGeometry) return this._computeTransformedRectBounds(0, 0, 0, 0);

        const strokePad = this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth / 2 : 0;
        if (strokePad) {
            minX -= strokePad;
            minY -= strokePad;
            maxX += strokePad;
            maxY += strokePad;
        }

        return this._computeTransformedRectBounds(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY));
    }

    static #quadraticBounds(p0: Point, p1: Point, p2: Point): { minX: number; minY: number; maxX: number; maxY: number } {
        const minX = Math.min(p0.x, p2.x);
        const minY = Math.min(p0.y, p2.y);
        const maxX = Math.max(p0.x, p2.x);
        const maxY = Math.max(p0.y, p2.y);
        let bounds = { minX, minY, maxX, maxY };

        const checkAxis = (coord0: number, coord1: number, coord2: number, setter: (value: number) => void) => {
            const denom = coord0 - 2 * coord1 + coord2;
            if (Math.abs(denom) < 1e-12) return;
            const t = (coord0 - coord1) / denom;
            if (t <= 0 || t >= 1) return;
            const value = BezierPath.#quadraticAt(coord0, coord1, coord2, t);
            setter(value);
        };

        let b = bounds;
        checkAxis(p0.x, p1.x, p2.x, (value) => {
            if (value < b.minX) b = { ...b, minX: value };
            if (value > b.maxX) b = { ...b, maxX: value };
        });
        checkAxis(p0.y, p1.y, p2.y, (value) => {
            if (value < b.minY) b = { ...b, minY: value };
            if (value > b.maxY) b = { ...b, maxY: value };
        });
        return b;
    }

    static #cubicBounds(
        p0: Point,
        p1: Point,
        p2: Point,
        p3: Point
    ): { minX: number; minY: number; maxX: number; maxY: number } {
        let minX = Math.min(p0.x, p3.x);
        let minY = Math.min(p0.y, p3.y);
        let maxX = Math.max(p0.x, p3.x);
        let maxY = Math.max(p0.y, p3.y);

        const update = (x: number, y: number) => {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };

        const evaluate = (t: number) => {
            const x = BezierPath.#cubicAt(p0.x, p1.x, p2.x, p3.x, t);
            const y = BezierPath.#cubicAt(p0.y, p1.y, p2.y, p3.y, t);
            update(x, y);
        };

        for (const t of BezierPath.#cubicExtrema(p0.x, p1.x, p2.x, p3.x)) evaluate(t);
        for (const t of BezierPath.#cubicExtrema(p0.y, p1.y, p2.y, p3.y)) evaluate(t);

        return { minX, minY, maxX, maxY };
    }

    static #quadraticAt(p0: number, p1: number, p2: number, t: number): number {
        const inv = 1 - t;
        return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
    }

    static #cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const inv = 1 - t;
        return (
            inv * inv * inv * p0 +
            3 * inv * inv * t * p1 +
            3 * inv * t * t * p2 +
            t * t * t * p3
        );
    }

    static #cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
        const results: number[] = [];
        const a = -p0 + 3 * p1 - 3 * p2 + p3;
        const b = 3 * (p0 - 2 * p1 + p2);
        const c = 3 * (p1 - p0);
        const A = 3 * a;
        const B = 2 * b;
        const C = c;
        if (Math.abs(A) < 1e-12) {
            if (Math.abs(B) < 1e-12) return results;
            const t = -C / B;
            if (t > 0 && t < 1) results.push(t);
            return results;
        }
        const discriminant = B * B - 4 * A * C;
        if (discriminant < 0) return results;
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-B + sqrtD) / (2 * A);
        const t2 = (-B - sqrtD) / (2 * A);
        if (t1 > 0 && t1 < 1) results.push(t1);
        if (t2 > 0 && t2 < 1) results.push(t2);
        return results;
    }
}
