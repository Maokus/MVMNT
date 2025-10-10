import { Arc, Line, Poly, Rectangle, type RenderObject } from '@core/render/render-objects';

export type GlowOpacityFalloff = 'linear' | 'quadratic';

export interface GlowStyle {
    color: string;
    blur: number;
    opacity: number;
    layerCount?: number;
    layerSpread?: number;
    opacityFalloff?: GlowOpacityFalloff;
    applyShadowToBase?: boolean;
}

type RgbaColor = { r: number; g: number; b: number; a: number };

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function parseColor(input: string): RgbaColor | null {
    if (!input) return null;
    const color = input.trim();
    if (!color) return null;

    if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
            const r = Number.parseInt(hex[0] + hex[0], 16);
            const g = Number.parseInt(hex[1] + hex[1], 16);
            const b = Number.parseInt(hex[2] + hex[2], 16);
            return { r, g, b, a: 1 };
        }
        if (hex.length === 6) {
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            return { r, g, b, a: 1 };
        }
        if (hex.length === 8) {
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            const a = Number.parseInt(hex.slice(6, 8), 16) / 255;
            return { r, g, b, a };
        }
    }

    const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1]
            .split(',')
            .map((part) => part.trim())
            .map((part) => Number.parseFloat(part));
        if (parts.length >= 3 && parts.every((component) => Number.isFinite(component))) {
            const [r, g, b, a = 1] = parts;
            return {
                r: clamp(r, 0, 255),
                g: clamp(g, 0, 255),
                b: clamp(b, 0, 255),
                a: clamp(a, 0, 1),
            };
        }
    }

    return null;
}

function formatRgba(color: RgbaColor): string {
    const alpha = clamp(color.a, 0, 1);
    return `rgba(${Math.round(clamp(color.r, 0, 255))}, ${Math.round(clamp(color.g, 0, 255))}, ${Math.round(
        clamp(color.b, 0, 255),
    )}, ${alpha.toFixed(3)})`;
}

function withOpacity(color: string, opacity: number): string {
    const parsed = parseColor(color);
    if (!parsed) {
        return color;
    }
    const normalized = clamp(opacity, 0, 1);
    return formatRgba({ ...parsed, a: parsed.a * normalized });
}

function computeLayerOpacity(style: GlowStyle, index: number, layerCount: number): number {
    if (layerCount <= 0) return 0;
    const ratio = 1 - index / layerCount;
    if (style.opacityFalloff === 'quadratic') {
        return style.opacity * ratio * ratio;
    }
    return style.opacity * ratio;
}

function syncTransforms(source: RenderObject, target: RenderObject): void {
    target.scaleX = source.scaleX;
    target.scaleY = source.scaleY;
    target.rotation = source.rotation;
    target.skewX = source.skewX;
    target.skewY = source.skewY;
    target.opacity = source.opacity;
    target.visible = source.visible;
}

function applyShadowToBase(object: RenderObject & { setShadow?: (color: string | null, blur?: number, offsetX?: number, offsetY?: number) => unknown }, glow: GlowStyle): void {
    if (glow.blur > 0 && glow.opacity > 0 && glow.applyShadowToBase !== false && typeof object.setShadow === 'function') {
        object.setShadow(withOpacity(glow.color, glow.opacity), glow.blur, 0, 0);
    }
}

export function applyGlowToLine(line: Line, glow: GlowStyle | null | undefined): Line[] {
    if (!glow || glow.opacity <= 0) {
        if (glow) {
            applyShadowToBase(line, glow);
        }
        return [line];
    }

    applyShadowToBase(line, glow);

    const layerCount = Math.max(0, Math.floor(glow.layerCount ?? 0));
    if (layerCount <= 0) {
        return [line];
    }

    const results: Line[] = [];
    const spread = Math.max(0, glow.layerSpread ?? Math.max(1, line.lineWidth));
    const endPoint = line.getEndPoint();

    for (let i = 0; i < layerCount; i += 1) {
        const layerOpacity = computeLayerOpacity(glow, i, layerCount);
        if (layerOpacity <= 0) {
            continue;
        }
        const width = Math.max(line.lineWidth, line.lineWidth + spread * (layerCount - i));
        const glowLine = new Line(line.x, line.y, endPoint.x, endPoint.y, withOpacity(glow.color, layerOpacity), width, {
            includeInLayoutBounds: false,
        });
        glowLine.setLineCap(line.lineCap);
        if (line.lineDash.length) {
            glowLine.setLineDash([...line.lineDash]);
        }
        glowLine.setShadow(withOpacity(glow.color, layerOpacity), glow.blur, 0, 0);
        syncTransforms(line, glowLine);
        results.push(glowLine);
    }

    results.push(line);
    return results;
}

export function applyGlowToPoly(poly: Poly, glow: GlowStyle | null | undefined): Poly[] {
    if (!glow || glow.opacity <= 0) {
        if (glow) {
            applyShadowToBase(poly, glow);
        }
        return [poly];
    }

    applyShadowToBase(poly, glow);

    const layerCount = Math.max(0, Math.floor(glow.layerCount ?? 0));
    if (layerCount <= 0) {
        return [poly];
    }

    const results: Poly[] = [];
    const spread = Math.max(0, glow.layerSpread ?? Math.max(1, poly.strokeWidth));

    for (let i = 0; i < layerCount; i += 1) {
        const layerOpacity = computeLayerOpacity(glow, i, layerCount);
        if (layerOpacity <= 0) {
            continue;
        }
        const strokeWidth = Math.max(poly.strokeWidth, poly.strokeWidth + spread * (layerCount - i));
        const glowPoly = new Poly(
            poly.points.map((point) => ({ ...point })),
            null,
            withOpacity(glow.color, layerOpacity),
            strokeWidth,
            { includeInLayoutBounds: false },
        );
        glowPoly.setClosed(poly.closed);
        glowPoly.setLineJoin(poly.lineJoin);
        glowPoly.setLineCap(poly.lineCap);
        glowPoly.setMiterLimit(poly.miterLimit);
        if (poly.lineDash.length) {
            glowPoly.setLineDash([...poly.lineDash]);
        }
        glowPoly.setShadow(withOpacity(glow.color, layerOpacity), glow.blur, 0, 0);
        syncTransforms(poly, glowPoly);
        results.push(glowPoly);
    }

    results.push(poly);
    return results;
}

export function applyGlowToRectangle(rect: Rectangle, glow: GlowStyle | null | undefined): Rectangle[] {
    if (!glow || glow.opacity <= 0) {
        if (glow) {
            applyShadowToBase(rect, glow);
        }
        return [rect];
    }

    applyShadowToBase(rect, glow);

    const layerCount = Math.max(0, Math.floor(glow.layerCount ?? 0));
    if (layerCount <= 0) {
        return [rect];
    }

    const results: Rectangle[] = [];
    const spread = Math.max(0, glow.layerSpread ?? Math.max(rect.width, rect.height) * 0.05);

    for (let i = 0; i < layerCount; i += 1) {
        const layerOpacity = computeLayerOpacity(glow, i, layerCount);
        if (layerOpacity <= 0) {
            continue;
        }
        const expansion = spread * (layerCount - i);
        const glowRect = new Rectangle(
            rect.x - expansion,
            rect.y - expansion,
            rect.width + expansion * 2,
            rect.height + expansion * 2,
            withOpacity(glow.color, layerOpacity),
            null,
            0,
            { includeInLayoutBounds: false },
        );
        glowRect.setCornerRadius(rect.cornerRadius);
        glowRect.setShadow(withOpacity(glow.color, layerOpacity), glow.blur, 0, 0);
        glowRect.setGlobalAlpha(1);
        syncTransforms(rect, glowRect);
        results.push(glowRect);
    }

    results.push(rect);
    return results;
}

export function applyGlowToArc(arc: Arc, glow: GlowStyle | null | undefined): Arc[] {
    if (!glow || glow.opacity <= 0) {
        if (glow) {
            applyShadowToBase(arc, glow);
        }
        return [arc];
    }

    applyShadowToBase(arc, glow);

    const layerCount = Math.max(0, Math.floor(glow.layerCount ?? 0));
    if (layerCount <= 0) {
        return [arc];
    }

    const results: Arc[] = [];
    const spread = Math.max(0, glow.layerSpread ?? Math.max(1, arc.strokeWidth));

    for (let i = 0; i < layerCount; i += 1) {
        const layerOpacity = computeLayerOpacity(glow, i, layerCount);
        if (layerOpacity <= 0) {
            continue;
        }

        const expansion = spread * (layerCount - i);
        const radius = Math.max(0, arc.radius + expansion);
        const fillColor = arc.fillColor ? withOpacity(glow.color, layerOpacity) : null;
        const strokeColor = arc.strokeColor ? withOpacity(glow.color, layerOpacity) : null;
        const strokeWidth = Math.max(arc.strokeWidth, arc.strokeWidth + expansion * 0.5);

        const glowArc = new Arc(
            arc.x,
            arc.y,
            radius,
            arc.startAngle,
            arc.endAngle,
            arc.anticlockwise,
            {
                fillColor,
                strokeColor,
                strokeWidth,
                fillRule: arc.fillRule,
                includeInLayoutBounds: false,
            },
        );
        glowArc.setLineCap(arc.lineCap);
        glowArc.setLineDash([...arc.lineDash]);
        glowArc.setGlobalAlpha(arc.globalAlpha);
        glowArc.setShadow(withOpacity(glow.color, layerOpacity), glow.blur, 0, 0);
        syncTransforms(arc, glowArc);
        results.push(glowArc);
    }

    results.push(arc);
    return results;
}
