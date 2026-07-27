import { RenderObject, RenderConfig, Bounds, type RenderObjectOptions } from './base';

type TextAlign = CanvasTextAlign; // 'left' | 'right' | 'center' | 'start' | 'end'
type TextBaseline = CanvasTextBaseline; // 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'

interface TextShadow {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
}

export interface TextOptions extends RenderObjectOptions {
    color?: string;
    align?: TextAlign;
    baseline?: TextBaseline;
    strokeColor?: string | null;
    strokeWidth?: number;
    maxWidth?: number | null;
    letterSpacing?: number;
    shadow?: TextShadow | null;
}

export class Text extends RenderObject {
    text: string;
    font: string;
    color: string;
    align: TextAlign;
    baseline: TextBaseline;
    strokeColor: string | null;
    strokeWidth: number;
    maxWidth: number | null;
    shadow: TextShadow | null;
    /** Letter spacing in pixels. Applied via `ctx.letterSpacing` (Chrome 97+, supported in offscreen canvas). */
    letterSpacing: number;
    static __measureCtx?: CanvasRenderingContext2D | null; // offscreen measure context cache

    constructor(x: number, y: number, text: string, font = '16px Arial', options: TextOptions = {}) {
        const maxPosition = 1_000_000;
        const clampedX = Math.max(-maxPosition, Math.min(maxPosition, x));
        const clampedY = Math.max(-maxPosition, Math.min(maxPosition, y));
        if (clampedX !== x || clampedY !== y) {
            console.warn(
                `Text constructor: Extreme position values clamped - original: (${x}, ${y}), clamped: (${clampedX}, ${clampedY})`
            );
        }
        super(clampedX, clampedY, 1, 1, 1, options);
        this.text = text;
        this.font = font;
        this.color = options.color ?? '#FFFFFF';
        this.align = options.align ?? 'left';
        this.baseline = options.baseline ?? 'top';
        this.strokeColor = options.strokeColor ?? null;
        this.strokeWidth = options.strokeWidth ?? 0;
        this.maxWidth = options.maxWidth ?? null;
        this.shadow = options.shadow ?? null;
        this.letterSpacing = options.letterSpacing ?? 0;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D): void {
        ctx.font = this.font;
        ctx.textAlign = this.align;
        ctx.textBaseline = this.baseline;
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = this.letterSpacing + 'px';
        if (this.shadow) {
            ctx.shadowColor = this.shadow.color;
            ctx.shadowBlur = this.shadow.blur;
            ctx.shadowOffsetX = this.shadow.offsetX;
            ctx.shadowOffsetY = this.shadow.offsetY;
        }
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            if (this.maxWidth != null) ctx.strokeText(this.text, 0, 0, this.maxWidth);
            else ctx.strokeText(this.text, 0, 0);
        }
        ctx.fillStyle = this.color;
        if (this.maxWidth != null) ctx.fillText(this.text, 0, 0, this.maxWidth);
        else ctx.fillText(this.text, 0, 0);
        if (this.shadow) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
    }

    setText(text: string): this {
        this.text = text;
        return this;
    }
    setFont(font: string): this {
        this.font = font;
        return this;
    }
    setColor(color: string): this {
        this.color = color;
        return this;
    }
    setFill(color: string): this {
        return this.setColor(color);
    }
    setAlignment(align: TextAlign, baseline: TextBaseline = this.baseline): this {
        this.align = align;
        this.baseline = baseline;
        return this;
    }
    setStroke(color: string | null, width: number): this {
        this.strokeColor = color;
        this.strokeWidth = Math.max(0, width);
        return this;
    }
    setMaxWidth(width: number | null): this {
        this.maxWidth = width;
        return this;
    }
    setShadow(color: string, blur: number, offsetX = 0, offsetY = 0): this {
        this.shadow = { color, blur, offsetX, offsetY };
        return this;
    }

    measureText(ctx: CanvasRenderingContext2D): TextMetrics {
        const prev = ctx.font;
        ctx.font = this.font;
        const metrics = ctx.measureText(this.text);
        ctx.font = prev;
        return metrics;
    }

    protected _getSelfBounds(): Bounds {
        const fontSize = this.#extractFontSize(this.font);
        if (!isFinite(this.x) || !isFinite(this.y) || !isFinite(fontSize)) {
            console.warn(
                `Text getBounds: Invalid values detected - x=${this.x}, y=${this.y}, fontSize=${fontSize}, font=${this.font}`
            );
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        const ctx = Text.#getMeasureContext();
        if (!ctx) {
            const fallbackWidth = this.text.length * fontSize * 0.6;
            const fallbackHeight = fontSize * 1.3;
            // Compute local rect in object space, then transform
            let lx = 0,
                ly = 0,
                lw = fallbackWidth,
                lh = fallbackHeight;
            if (this.align === 'center') lx -= lw / 2;
            else if (this.align === 'right' || this.align === 'end') lx -= lw;
            switch (this.baseline) {
                case 'middle':
                    ly -= lh / 2;
                    break;
                case 'bottom':
                case 'ideographic':
                    ly -= lh;
                    break;
                case 'alphabetic':
                    ly -= lh * 0.8;
                    break;
            }
            return this._computeTransformedRectBounds(lx, ly, lw, lh);
        }
        const prevFont = ctx.font;
        const prevBaseline = ctx.textBaseline;
        ctx.font = this.font;
        // TextMetrics' actual bounding box values are relative to the active
        // baseline. Measure using the same baseline used by fillText/strokeText.
        ctx.textBaseline = this.baseline;
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = this.letterSpacing + 'px';
        const metrics = ctx.measureText(this.text);
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
        ctx.textBaseline = prevBaseline;
        ctx.font = prevFont;
        let width = metrics.width || 0;
        let ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
        let descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
        let height = ascent + descent;
        let textScale = 1;
        if (this.maxWidth != null && isFinite(this.maxWidth) && this.maxWidth > 0 && width > this.maxWidth) {
            textScale = this.maxWidth / width;
            width *= textScale;
            ascent *= textScale;
            descent *= textScale;
            height *= textScale;
        }
        const actualLeft = metrics.actualBoundingBoxLeft;
        const actualRight = metrics.actualBoundingBoxRight;
        // `width` is an advance measurement, not an ink measurement. Glyphs
        // may overhang either side of it (notably italic/script fonts), so use
        // the actual box whenever the canvas provides it. Some canvas mocks
        // expose these properties as zero, hence the advance-width fallback.
        const hasHorizontalInkBounds =
            Number.isFinite(actualLeft) &&
            Number.isFinite(actualRight) &&
            (actualLeft > 0 || actualRight > 0 || width === 0);
        const inkLeft = hasHorizontalInkBounds ? actualLeft * textScale : 0;
        const inkRight = hasHorizontalInkBounds ? actualRight * textScale : width;
        let advanceStart = 0;
        if (this.align === 'center') advanceStart = -width / 2;
        else if (this.align === 'right' || this.align === 'end') advanceStart = -width;

        // The active textBaseline makes the ink box directly relative to the
        // same (0, 0) anchor passed to CanvasRenderingContext2D.fillText.
        let lx = advanceStart - inkLeft;
        let ly = -ascent;
        let lw = inkLeft + inkRight;
        let lh = height;

        const strokeRadius = this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth / 2 : 0;
        lx -= strokeRadius;
        ly -= strokeRadius;
        lw += strokeRadius * 2;
        lh += strokeRadius * 2;
        if (this.shadow) {
            // Canvas blur kernels have a soft tail. Two blur radii conservatively
            // cover the rendered shadow, preventing source-canvas clipping.
            const shadowRadius = this.shadow.blur * 2;
            const right = lx + lw;
            const bottom = ly + lh;
            lx = Math.min(lx, lx + this.shadow.offsetX - shadowRadius);
            ly = Math.min(ly, ly + this.shadow.offsetY - shadowRadius);
            lw = Math.max(right, right + this.shadow.offsetX + shadowRadius) - lx;
            lh = Math.max(bottom, bottom + this.shadow.offsetY + shadowRadius) - ly;
        }
        const result: Bounds = this._computeTransformedRectBounds(lx, ly, lw, lh);
        if (
            !isFinite(result.x) ||
            !isFinite(result.y) ||
            !isFinite(result.width) ||
            !isFinite(result.height) ||
            result.width < 0 ||
            result.height < 0
        ) {
            console.warn('Text getBounds: Invalid result detected', {
                text: this.text,
                font: this.font,
                position: { x: this.x, y: this.y },
                align: this.align,
                baseline: this.baseline,
                measured: { width, ascent, descent, height },
                result,
            });
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        return result;
    }

    #extractFontSize(fontString: string): number {
        const match = fontString.match(/(\d*\.?\d+)px/);
        if (match) return parseFloat(match[1]);
        const numberMatch = fontString.match(/(\d*\.?\d+)/);
        return numberMatch ? parseFloat(numberMatch[1]) : 16;
    }

    static #getMeasureContext(): CanvasRenderingContext2D | null {
        if (typeof Text.__measureCtx !== 'undefined') return Text.__measureCtx ?? null;
        let ctx: CanvasRenderingContext2D | null = null;
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                const c = new OffscreenCanvas(1, 1);
                ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
            } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                const c = document.createElement('canvas');
                ctx = c.getContext('2d');
            }
        } catch {
            ctx = null;
        }
        Text.__measureCtx = ctx;
        return ctx;
    }
}
