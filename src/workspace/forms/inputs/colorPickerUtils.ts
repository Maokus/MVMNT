export interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface HsvaColor {
    h: number;
    s: number;
    v: number;
    a: number;
}

export type ColorFieldMode = 'hsv' | 'rgb';

export const COLOR_FIELD_MODE_STORAGE_KEY = 'mvmnt.color-picker.field-mode.v1';
export const RECENT_COLORS_STORAGE_KEY = 'mvmnt.color-picker.recent-colors.v1';
export const MAX_RECENT_COLORS = 8;

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)%?\s*)?\)$/i;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360;

const expandHex = (hex: string): string => {
    if (hex.length !== 3 && hex.length !== 4) return hex;
    return [...hex].map((character) => `${character}${character}`).join('');
};

export function parseHexColor(value: string): RgbaColor | null {
    const match = value.trim().match(HEX_PATTERN);
    if (!match) return null;

    const expanded = expandHex(match[1]);
    const withAlpha = expanded.length === 6 ? `${expanded}FF` : expanded;
    return {
        r: parseInt(withAlpha.slice(0, 2), 16),
        g: parseInt(withAlpha.slice(2, 4), 16),
        b: parseInt(withAlpha.slice(4, 6), 16),
        a: parseInt(withAlpha.slice(6, 8), 16) / 255,
    };
}

function parseRgbColor(value: string): RgbaColor | null {
    const match = value.trim().match(RGB_PATTERN);
    if (!match) return null;
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    return {
        r: clamp(Math.round(Number(match[1])), 0, 255),
        g: clamp(Math.round(Number(match[2])), 0, 255),
        b: clamp(Math.round(Number(match[3])), 0, 255),
        a: clamp(alpha > 1 ? alpha / 100 : alpha, 0, 1),
    };
}

function resolveCssColor(value: string): RgbaColor | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    const probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = value;
    if (!probe.style.color) return null;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = window.getComputedStyle(probe).color;
    probe.remove();
    return parseRgbColor(resolved);
}

export function parseColor(value: unknown): RgbaColor | null {
    if (typeof value !== 'string') return null;
    return parseHexColor(value) ?? parseRgbColor(value) ?? resolveCssColor(value);
}

export function rgbaToHsva({ r, g, b, a }: RgbaColor): HsvaColor {
    const red = clamp(r, 0, 255) / 255;
    const green = clamp(g, 0, 255) / 255;
    const blue = clamp(b, 0, 255) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let hue = 0;
    if (delta !== 0) {
        if (max === red) hue = 60 * (((green - blue) / delta) % 6);
        else if (max === green) hue = 60 * ((blue - red) / delta + 2);
        else hue = 60 * ((red - green) / delta + 4);
    }

    return {
        h: normalizeHue(hue),
        s: max === 0 ? 0 : (delta / max) * 100,
        v: max * 100,
        a: clamp(a, 0, 1),
    };
}

export function hsvaToRgba({ h, s, v, a }: HsvaColor): RgbaColor {
    const hue = normalizeHue(h);
    const saturation = clamp(s, 0, 100) / 100;
    const value = clamp(v, 0, 100) / 100;
    const chroma = value * saturation;
    const section = hue / 60;
    const x = chroma * (1 - Math.abs((section % 2) - 1));
    const offset = value - chroma;

    let red = 0;
    let green = 0;
    let blue = 0;
    if (section < 1) [red, green] = [chroma, x];
    else if (section < 2) [red, green] = [x, chroma];
    else if (section < 3) [green, blue] = [chroma, x];
    else if (section < 4) [green, blue] = [x, chroma];
    else if (section < 5) [red, blue] = [x, chroma];
    else [red, blue] = [chroma, x];

    return {
        r: Math.round((red + offset) * 255),
        g: Math.round((green + offset) * 255),
        b: Math.round((blue + offset) * 255),
        a: clamp(a, 0, 1),
    };
}

const byteToHex = (value: number): string => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

export function hsvaToHex(color: HsvaColor, includeAlpha = false): string {
    const rgba = hsvaToRgba(color);
    const alpha = includeAlpha ? byteToHex(rgba.a * 255) : '';
    return `#${byteToHex(rgba.r)}${byteToHex(rgba.g)}${byteToHex(rgba.b)}${alpha}`.toUpperCase();
}

export function colorToHsva(value: unknown, fallback: HsvaColor = { h: 0, s: 0, v: 0, a: 1 }): HsvaColor {
    const parsed = parseColor(value);
    return parsed ? rgbaToHsva(parsed) : fallback;
}

export function preserveAchromaticHue(previous: HsvaColor, next: HsvaColor): HsvaColor {
    return next.s <= 0.0001 || next.v <= 0.0001 ? { ...next, h: previous.h } : next;
}

const storageOrNull = (): Storage | null => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
};

export function loadColorFieldMode(storage: Storage | null = storageOrNull()): ColorFieldMode {
    try {
        const value = storage?.getItem(COLOR_FIELD_MODE_STORAGE_KEY);
        return value === 'rgb' || value === 'hsv' ? value : 'hsv';
    } catch {
        return 'hsv';
    }
}

export function saveColorFieldMode(mode: ColorFieldMode, storage: Storage | null = storageOrNull()): void {
    try {
        storage?.setItem(COLOR_FIELD_MODE_STORAGE_KEY, mode);
    } catch {
        // Picker preferences remain optional when storage is unavailable.
    }
}

export function normalizeRecentColors(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const unique = new Set<string>();
    for (const candidate of value) {
        const parsed = parseHexColor(typeof candidate === 'string' ? candidate : '');
        if (!parsed) continue;
        unique.add(hsvaToHex(rgbaToHsva(parsed)));
        if (unique.size === MAX_RECENT_COLORS) break;
    }
    return [...unique];
}

export function loadRecentColors(storage: Storage | null = storageOrNull()): string[] {
    try {
        const stored = storage?.getItem(RECENT_COLORS_STORAGE_KEY);
        return stored ? normalizeRecentColors(JSON.parse(stored)) : [];
    } catch {
        return [];
    }
}

export function storeRecentColor(color: HsvaColor, storage: Storage | null = storageOrNull()): string[] {
    const canonical = hsvaToHex(color);
    const next = [canonical, ...loadRecentColors(storage).filter((recent) => recent !== canonical)].slice(
        0,
        MAX_RECENT_COLORS
    );
    try {
        storage?.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Recent colors remain an in-memory convenience when storage is unavailable.
    }
    return next;
}

export function generateTonePalette(hue: number): string[] {
    const normalizedHue = normalizeHue(hue);
    return [
        { s: 15, v: 100 },
        { s: 25, v: 96 },
        { s: 42, v: 93 },
        { s: 62, v: 90 },
        { s: 82, v: 87 },
        { s: 100, v: 80 },
        { s: 100, v: 64 },
        { s: 100, v: 47 },
    ].map(({ s, v }) => hsvaToHex({ h: normalizedHue, s, v, a: 1 }));
}

export function generateBasePalette(): string[] {
    const accents = [0, 30, 60, 120, 180, 210, 270, 330].map((h) => hsvaToHex({ h, s: 78, v: 90, a: 1 }));
    const neutrals = [100, 88, 75, 60, 45, 30, 15, 0].map((v) => hsvaToHex({ h: 0, s: 0, v, a: 1 }));
    return [...accents, ...neutrals];
}

export function saturationValueFromPoint(
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): Pick<HsvaColor, 's' | 'v'> {
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    return {
        s: clamp(((clientX - bounds.left) / width) * 100, 0, 100),
        v: clamp(100 - ((clientY - bounds.top) / height) * 100, 0, 100),
    };
}

export function hueFromPoint(clientX: number, bounds: Pick<DOMRect, 'left' | 'width'>): number {
    return clamp(((clientX - bounds.left) / Math.max(bounds.width, 1)) * 360, 0, 360);
}

export function alphaFromPoint(clientX: number, bounds: Pick<DOMRect, 'left' | 'width'>): number {
    return clamp((clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1);
}
