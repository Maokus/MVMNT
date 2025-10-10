interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

const HEX_SHORT_RE = /^#([\da-f]{3,4})$/i;
const HEX_LONG_RE = /^#([\da-f]{6})([\da-f]{2})?$/i;
const RGB_RE = /^rgba?\(([^)]+)\)$/i;
const HSL_RE = /^hsla?\(([^)]+)\)$/i;

let parserCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let parserContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function ensureParser(): void {
    if (parserContext) return;
    try {
        if (typeof OffscreenCanvas !== 'undefined') {
            parserCanvas = new OffscreenCanvas(1, 1);
            parserContext = parserCanvas.getContext('2d');
        } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            parserCanvas = document.createElement('canvas');
            parserContext = parserCanvas.getContext('2d');
        }
    } catch {
        parserCanvas = null;
        parserContext = null;
    }
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function parseHexShort(match: RegExpExecArray): RgbaColor {
    const hex = match[1];
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) : 255;
    return { r, g, b, a };
}

function parseHexLong(match: RegExpExecArray): RgbaColor {
    const rgb = match[1];
    const aHex = match[2];
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    const a = aHex ? parseInt(aHex, 16) : 255;
    return { r, g, b, a };
}

function parseRgb(match: RegExpExecArray): RgbaColor | null {
    const parts = match[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const [rRaw, gRaw, bRaw, aRaw] = parts;
    const r = parseFloat(rRaw);
    const g = parseFloat(gRaw);
    const b = parseFloat(bRaw);
    const alpha = aRaw !== undefined ? parseFloat(aRaw) : 1;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(alpha)) return null;
    return {
        r: clamp01(r / (rRaw.endsWith('%') ? 100 : 1)) * 255,
        g: clamp01(g / (gRaw.endsWith('%') ? 100 : 1)) * 255,
        b: clamp01(b / (bRaw.endsWith('%') ? 100 : 1)) * 255,
        a: clamp01(alpha) * 255,
    };
}

function hueToRgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function parseHsl(match: RegExpExecArray): RgbaColor | null {
    const parts = match[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
    const s = clamp01(parseFloat(parts[1]) / (parts[1].endsWith('%') ? 100 : 1));
    const l = clamp01(parseFloat(parts[2]) / (parts[2].endsWith('%') ? 100 : 1));
    const alpha = parts[3] !== undefined ? clamp01(parseFloat(parts[3])) : 1;
    if ([h, s, l, alpha].some((value) => Number.isNaN(value))) return null;
    if (s === 0) {
        const val = l * 255;
        return { r: val, g: val, b: val, a: alpha * 255 };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hueToRgb(p, q, h / 360 + 1 / 3);
    const g = hueToRgb(p, q, h / 360);
    const b = hueToRgb(p, q, h / 360 - 1 / 3);
    return { r: r * 255, g: g * 255, b: b * 255, a: alpha * 255 };
}

function parseWithCanvas(color: string): RgbaColor | null {
    ensureParser();
    if (!parserContext) return null;
    parserContext.fillStyle = '#000';
    parserContext.fillStyle = color;
    const computed = parserContext.fillStyle;
    if (typeof computed !== 'string') return null;
    if (!computed.startsWith('#')) return null;
    const normalized = computed.length === 4 ? computed.replace(/(.)/g, '$1$1') : computed;
    const match = HEX_LONG_RE.exec(normalized);
    if (!match) return null;
    return parseHexLong(match);
}

function toFloatTuple(color: RgbaColor): [number, number, number, number] {
    return [color.r / 255, color.g / 255, color.b / 255, color.a / 255];
}

export function parseCssColor(color: string | null | undefined): [number, number, number, number] | null {
    if (!color) return null;
    if (color === 'transparent') return [0, 0, 0, 0];
    const hexShort = HEX_SHORT_RE.exec(color);
    if (hexShort) return toFloatTuple(parseHexShort(hexShort));
    const hexLong = HEX_LONG_RE.exec(color);
    if (hexLong) return toFloatTuple(parseHexLong(hexLong));
    const rgb = RGB_RE.exec(color);
    if (rgb) {
        const parsed = parseRgb(rgb);
        if (parsed) return toFloatTuple(parsed);
    }
    const hsl = HSL_RE.exec(color);
    if (hsl) {
        const parsed = parseHsl(hsl);
        if (parsed) return toFloatTuple(parsed);
    }
    const fallback = parseWithCanvas(color);
    return fallback ? toFloatTuple(fallback) : null;
}

export function multiplyColorAlpha(
    color: [number, number, number, number] | null,
    alpha: number
): [number, number, number, number] | null {
    if (!color) return null;
    const [r, g, b, a] = color;
    return [r, g, b, clamp01(a * alpha)];
}

export function premultiplyColor(
    color: [number, number, number, number]
): [number, number, number, number] {
    const [r, g, b, a] = color;
    return [r * a, g * a, b * a, a];
}
