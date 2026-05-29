import { RenderObject, RenderConfig, Bounds } from './base';

type TextAlign = CanvasTextAlign; // 'left' | 'right' | 'center' | 'start' | 'end'
type TextBaseline = CanvasTextBaseline; // 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'

interface TextShadow {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
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

    constructor(
        x: number,
        y: number,
        text: string,
        font = '16px Arial',
        color = '#FFFFFF',
        align: TextAlign = 'left',
        baseline: TextBaseline = 'top',
        options?: { includeInLayoutBounds?: boolean }
    ) {
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
        this.color = color;
        this.align = align;
        this.baseline = baseline;
        this.strokeColor = null;
        this.strokeWidth = 0;
        this.maxWidth = null;
        this.shadow = null;
        this.letterSpacing = 0;
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
        ctx.font = this.font;
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = this.letterSpacing + 'px';
        const metrics = ctx.measureText(this.text);
        if (this.letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
        ctx.font = prevFont;
        let width = metrics.width || 0;
        const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
        const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
        let height = ascent + descent;
        if (this.maxWidth != null && isFinite(this.maxWidth) && this.maxWidth > 0 && width > this.maxWidth) {
            const scale = this.maxWidth / width;
            width *= scale;
            height *= scale;
        }
        const strokePad = this.strokeColor && this.strokeWidth > 0 ? this.strokeWidth : 0;
        const paddedWidth = width + strokePad;
        const paddedHeight = height + strokePad;
        // Compute local rect in object space (0,0 is text anchor point for drawing)
        let lx = 0,
            ly = 0,
            lw = paddedWidth,
            lh = paddedHeight;
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
                ly -= ascent + (strokePad ? strokePad / 2 : 0);
                break;
            case 'hanging':
                ly -= lh * 0.1;
                break;
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
