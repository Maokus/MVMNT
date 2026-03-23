/**
 * Color Interpolation Utilities
 *
 * Parse, format, and interpolate hex colors for automation keyframe evaluation.
 * Supports #RGB, #RRGGBB, and #RRGGBBAA formats.
 */

/** Parse a hex color string into [r, g, b, a] components (each 0-255). */
export function parseColor(hex: string): [number, number, number, number] {
    let h = hex.startsWith('#') ? hex.slice(1) : hex;

    // Expand shorthand (#RGB → RRGGBB)
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }

    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;

    return [
        Number.isNaN(r) ? 0 : r,
        Number.isNaN(g) ? 0 : g,
        Number.isNaN(b) ? 0 : b,
        Number.isNaN(a) ? 255 : a,
    ];
}

/** Format [r, g, b, a] components (each 0-255) back to a hex color string. */
export function formatColor(rgba: [number, number, number, number], includeAlpha: boolean = false): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const hex = (v: number) => clamp(v).toString(16).padStart(2, '0');

    const base = `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`;
    if (includeAlpha && rgba[3] < 255) {
        return base + hex(rgba[3]);
    }
    return base;
}

/**
 * Linearly interpolate between two hex color strings.
 * Interpolation is done in RGB space with the given eased `t` parameter (0-1).
 */
export function lerpColor(colorA: string, colorB: string, t: number): string {
    const a = parseColor(colorA);
    const b = parseColor(colorB);
    const hasAlpha = colorA.length > 7 || colorB.length > 7;

    const result: [number, number, number, number] = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
    ];

    return formatColor(result, hasAlpha);
}
