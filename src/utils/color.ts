const HEX_8_PATTERN = /^#[0-9A-F]{8}$/i;
const HEX_6_PATTERN = /^#[0-9A-F]{6}$/i;
const HEX_4_PATTERN = /^#[0-9A-F]{4}$/i;
const HEX_3_PATTERN = /^#[0-9A-F]{3}$/i;
const RGBA_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i;

const clampByte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

const expandShortHex = (hex: string): string => {
    if (hex.length === 3) {
        return hex
            .split('')
            .map((char) => char + char)
            .join('');
    }

    if (hex.length === 4) {
        const [r, g, b, a] = hex.split('');
        return `${r}${r}${g}${g}${b}${b}${a}${a}`;
    }

    return hex;
};

const toEightDigitHex = (candidate: string): string | null => {
    if (typeof candidate !== 'string') {
        return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.toLowerCase() === 'transparent') {
        return '#00000000';
    }

    const rgbaMatch = trimmed.match(RGBA_PATTERN);
    if (rgbaMatch) {
        const r = clampByte(parseFloat(rgbaMatch[1]));
        const g = clampByte(parseFloat(rgbaMatch[2]));
        const b = clampByte(parseFloat(rgbaMatch[3]));
        const alphaRaw = rgbaMatch[4];
        const a = (() => {
            if (alphaRaw === undefined) return 255;
            const alphaNumber = parseFloat(alphaRaw);
            if (!Number.isFinite(alphaNumber)) return 255;
            if (alphaNumber <= 1) {
                return clampByte(Math.round(alphaNumber * 255));
            }
            return clampByte(alphaNumber);
        })();

        const toHex = (component: number) => component.toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
    }

    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

    if (HEX_8_PATTERN.test(normalized)) {
        return normalized.toUpperCase();
    }

    if (HEX_6_PATTERN.test(normalized)) {
        return `${normalized.toUpperCase()}FF`;
    }

    if (HEX_4_PATTERN.test(normalized)) {
        const expanded = expandShortHex(normalized.slice(1));
        return `#${expanded.toUpperCase()}`;
    }

    if (HEX_3_PATTERN.test(normalized)) {
        const expanded = expandShortHex(normalized.slice(1));
        return `#${expanded.toUpperCase()}FF`;
    }

    return null;
};

const normalizeFallback = (fallback: string): string => toEightDigitHex(fallback) ?? '#000000FF';

export const normalizeColorAlphaValue = (value: unknown, fallback: string): string => {
    const normalizedFallback = normalizeFallback(fallback);

    if (typeof value !== 'string') {
        return normalizedFallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return normalizedFallback;
    }

    const converted = toEightDigitHex(trimmed);
    if (converted) {
        return converted;
    }

    return trimmed;
};

export const ensureEightDigitHex = (value: string, fallback: string): string => {
    const converted = toEightDigitHex(value);
    if (converted) {
        return converted;
    }
    return normalizeFallback(fallback);
};
