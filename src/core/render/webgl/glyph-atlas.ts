import { multiplyColorAlpha, parseCssColor } from './color';
import { applyMatrix, IDENTITY_MATRIX, Matrix3, multiplyMatrices } from './math';

export interface GlyphAtlasPage {
    id: string;
    width: number;
    height: number;
    dirty: boolean;
    version: number;
    canvas: HTMLCanvasElement | OffscreenCanvas | null;
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    data: Uint8ClampedArray | null;
    cursorX: number;
    cursorY: number;
    rowHeight: number;
}

interface GlyphInfo {
    pageId: string;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
    width: number;
    height: number;
    advance: number;
    offsetX: number;
    offsetY: number;
    ascent: number;
    descent: number;
}

export interface GlyphQuad {
    position: [number, number, number, number, number, number];
    uv: [number, number, number, number, number, number];
}

export interface TextLayoutResult {
    quads: GlyphQuad[];
    color: [number, number, number, number];
    page: GlyphAtlasPage;
    vertexCount: number;
    width: number;
    ascent: number;
    descent: number;
}

interface EnsurePageOptions {
    pageKey: string;
}

interface LayoutOptions {
    text: string;
    font: string;
    color: string;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    transform: Matrix3;
    opacity: number;
}

const DEFAULT_PAGE_SIZE = 1024;
const GLYPH_PADDING = 2;

function createCanvas(width: number, height: number): {
    canvas: HTMLCanvasElement | OffscreenCanvas | null;
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    data: Uint8ClampedArray | null;
} {
    try {
        const has2DContext = typeof CanvasRenderingContext2D !== 'undefined';
        const hasOffscreen2D = typeof OffscreenCanvasRenderingContext2D !== 'undefined';

        if (typeof OffscreenCanvas !== 'undefined' && hasOffscreen2D) {
            const canvas = new OffscreenCanvas(width, height);
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = 'rgba(0,0,0,0)';
                context.clearRect(0, 0, width, height);
                return { canvas, context, data: null };
            }
        }
        if (has2DContext && typeof document !== 'undefined' && typeof document.createElement === 'function') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            try {
                const context = canvas.getContext('2d');
                if (context) {
                    context.clearRect(0, 0, width, height);
                    return { canvas, context, data: null };
                }
            } catch {
                // fall through to data-backed atlas when canvas contexts are unavailable
            }
        }
    } catch {
        // fallthrough
    }
    return { canvas: null, context: null, data: new Uint8ClampedArray(width * height) };
}

function glyphKey(font: string, character: string): string {
    return `${font}::${character}`;
}

export class GlyphAtlas {
    private readonly glyphs = new Map<string, GlyphInfo>();
    private readonly pages: GlyphAtlasPage[] = [];
    private readonly pageSize: number;

    constructor(pageSize = DEFAULT_PAGE_SIZE) {
        this.pageSize = pageSize;
    }

    layout(options: LayoutOptions): TextLayoutResult | null {
        if (!options.text) return null;
        const { color, opacity } = options;
        const parsedColor = multiplyColorAlpha(parseCssColor(color) ?? [1, 1, 1, 1], opacity) ?? [1, 1, 1, opacity];
        const page = this.ensurePage({ pageKey: options.font });
        const context = page.context;

        let totalWidth = 0;
        const quads: GlyphQuad[] = [];
        const glyphEntries: GlyphInfo[] = [];
        let ascent = 0;
        let descent = 0;

        for (const char of options.text) {
            const glyph = this.ensureGlyph(page, options.font, char);
            glyphEntries.push(glyph);
            totalWidth += glyph.advance;
            ascent = Math.max(ascent, glyph.ascent);
            descent = Math.max(descent, glyph.descent);
        }

        if (!glyphEntries.length) return null;

        const alignment = computeTextTransform(0, 0, options.align, options.baseline, totalWidth, ascent, descent);
        const transform = multiplyMatrices(options.transform, alignment);

        let penX = 0;
        for (const glyph of glyphEntries) {
            const localX = penX + glyph.offsetX;
            const localY = -glyph.offsetY;
            const { width, height } = glyph;
            const p0 = applyMatrix(transform, localX, localY);
            const p1 = applyMatrix(transform, localX + width, localY);
            const p2 = applyMatrix(transform, localX + width, localY + height);
            const p3 = applyMatrix(transform, localX, localY + height);
            quads.push({
                position: [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y],
                uv: [glyph.u0, glyph.v0, glyph.u1, glyph.v0, glyph.u1, glyph.v1],
            });
            quads.push({
                position: [p0.x, p0.y, p2.x, p2.y, p3.x, p3.y],
                uv: [glyph.u0, glyph.v0, glyph.u1, glyph.v1, glyph.u0, glyph.v1],
            });
            penX += glyph.advance;
        }

        this.flushPage(context, page);

        // Alignment adjustments in clip space handled by transform; return geometry ready for upload.
        const vertexCount = quads.length * 3;
        return { quads, color: parsedColor, page, vertexCount, width: totalWidth, ascent, descent };
    }

    getDirtyPages(): GlyphAtlasPage[] {
        return this.pages.filter((page) => page.dirty);
    }

    markClean(page: GlyphAtlasPage): void {
        page.dirty = false;
        page.version += 1;
    }

    dispose(): void {
        this.glyphs.clear();
        this.pages.length = 0;
    }

    private ensurePage(options: EnsurePageOptions): GlyphAtlasPage {
        let page = this.pages.find((entry) => entry.id === options.pageKey);
        if (page) return page;
        const { canvas, context, data } = createCanvas(this.pageSize, this.pageSize);
        page = {
            id: options.pageKey,
            width: this.pageSize,
            height: this.pageSize,
            dirty: true,
            version: 0,
            canvas,
            context,
            data,
            cursorX: GLYPH_PADDING,
            cursorY: GLYPH_PADDING,
            rowHeight: 0,
        };
        if (context) {
            context.font = options.pageKey;
            context.textBaseline = 'alphabetic';
            context.fillStyle = 'white';
        }
        this.pages.push(page);
        return page;
    }

    private ensureGlyph(page: GlyphAtlasPage, font: string, character: string): GlyphInfo {
        const key = glyphKey(font, character);
        const cached = this.glyphs.get(key);
        if (cached) return cached;

        const { width, height, advance, offsetX, offsetY, ascent, descent, bitmap } = this.rasterizeGlyph(
            page,
            font,
            character
        );

        if (page.cursorX + width + GLYPH_PADDING > page.width) {
            page.cursorX = GLYPH_PADDING;
            page.cursorY += page.rowHeight + GLYPH_PADDING;
            page.rowHeight = 0;
        }
        if (page.cursorY + height + GLYPH_PADDING > page.height) {
            page.cursorX = GLYPH_PADDING;
            page.cursorY = GLYPH_PADDING;
            page.rowHeight = 0;
        }

        const drawX = page.cursorX;
        const drawY = page.cursorY;
        page.cursorX += width + GLYPH_PADDING;
        page.rowHeight = Math.max(page.rowHeight, height);

        if (page.context) {
            const ctx = page.context;
            ctx.save();
            ctx.font = font;
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'alphabetic';
            ctx.clearRect(drawX, drawY, width, height);
            ctx.fillText(character, drawX + offsetX, drawY + ascent);
            ctx.restore();
        } else if (page.data) {
            this.blitBitmap(page, drawX, drawY, width, height, bitmap);
        }

        const info: GlyphInfo = {
            pageId: page.id,
            u0: drawX / page.width,
            v0: drawY / page.height,
            u1: (drawX + width) / page.width,
            v1: (drawY + height) / page.height,
            width,
            height,
            advance,
            offsetX,
            offsetY,
            ascent,
            descent,
        };
        this.glyphs.set(key, info);
        page.dirty = true;
        return info;
    }

    private rasterizeGlyph(
        page: GlyphAtlasPage,
        font: string,
        character: string
    ): {
        width: number;
        height: number;
        advance: number;
        offsetX: number;
        offsetY: number;
        ascent: number;
        descent: number;
        bitmap: Uint8ClampedArray;
    } {
        if (page.context) {
            const ctx = page.context;
            ctx.save();
            ctx.font = font;
            ctx.textBaseline = 'alphabetic';
            const metrics = ctx.measureText(character);
            const ascent = metrics.actualBoundingBoxAscent ?? this.estimateAscent(font);
            const descent = metrics.actualBoundingBoxDescent ?? this.estimateDescent(font);
            const width = Math.ceil(metrics.width + GLYPH_PADDING * 2) || GLYPH_PADDING * 2 + 1;
            const height = Math.ceil(ascent + descent + GLYPH_PADDING * 2);
            ctx.restore();
            return {
                width,
                height,
                advance: metrics.width || 0,
                offsetX: GLYPH_PADDING,
                offsetY: GLYPH_PADDING + ascent,
                ascent,
                descent,
                bitmap: new Uint8ClampedArray(width * height),
            };
        }
        const ascent = this.estimateAscent(font);
        const descent = this.estimateDescent(font);
        const width = Math.ceil(this.estimateAdvance(font, character) + GLYPH_PADDING * 2);
        const height = Math.ceil(ascent + descent + GLYPH_PADDING * 2);
        const bitmap = new Uint8ClampedArray(width * height);
        bitmap.fill(255);
        return {
            width,
            height,
            advance: this.estimateAdvance(font, character),
            offsetX: GLYPH_PADDING,
            offsetY: GLYPH_PADDING + ascent,
            ascent,
            descent,
            bitmap,
        };
    }

    private blitBitmap(
        page: GlyphAtlasPage,
        x: number,
        y: number,
        width: number,
        height: number,
        bitmap: Uint8ClampedArray
    ): void {
        if (!page.data) return;
        const data = page.data;
        for (let row = 0; row < height; row += 1) {
            for (let col = 0; col < width; col += 1) {
                const destIndex = (y + row) * page.width + (x + col);
                const srcIndex = row * width + col;
                data[destIndex] = Math.max(data[destIndex], bitmap[srcIndex]);
            }
        }
    }

    private flushPage(
        context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
        page: GlyphAtlasPage
    ): void {
        if (!context && page.data) {
            // Nothing to do; data kept in memory.
            return;
        }
        page.dirty = true;
    }

    private estimateAdvance(font: string, character: string): number {
        const size = this.estimateFontSize(font);
        const base = size * 0.6;
        if (character === ' ') return base * 0.5;
        return base;
    }

    private estimateAscent(font: string): number {
        const size = this.estimateFontSize(font);
        return size * 0.8;
    }

    private estimateDescent(font: string): number {
        const size = this.estimateFontSize(font);
        return size * 0.2;
    }

    private estimateFontSize(font: string): number {
        const match = font.match(/(\d*\.?\d+)px/);
        if (match) return Number(match[1]);
        const fallback = font.match(/(\d*\.?\d+)/);
        if (fallback) return Number(fallback[1]);
        return 16;
    }
}

export function computeTextTransform(
    x: number,
    y: number,
    align: CanvasTextAlign,
    baseline: CanvasTextBaseline,
    width: number,
    ascent: number,
    descent: number
): Matrix3 {
    let offsetX = x;
    let offsetY = y;
    switch (align) {
        case 'center':
            offsetX -= width / 2;
            break;
        case 'right':
        case 'end':
            offsetX -= width;
            break;
        default:
            break;
    }
    switch (baseline) {
        case 'middle':
            offsetY += ascent / 2 - descent / 2;
            break;
        case 'bottom':
        case 'ideographic':
            offsetY -= descent;
            break;
        case 'alphabetic':
            offsetY += 0;
            break;
        case 'top':
        case 'hanging':
            offsetY += ascent;
            break;
    }
    return { ...IDENTITY_MATRIX, e: offsetX, f: offsetY };
}
