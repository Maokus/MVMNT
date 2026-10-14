/** Parse a committed numeric field: plain finite numbers only, no expression eval. */
export function parseNumberInput(rawValue: string): number | null {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed);
    return Number.isFinite(direct) ? direct : null;
}

/**
 * Parse with arithmetic-expression fallback (FormInput number fields).
 * Preserves existing acceptance: plain numbers first, then allowlisted
 * operators evaluated, anything else rejected.
 */
export function parseNumberInputWithExpression(rawValue: string): number | null {
    const plain = parseNumberInput(rawValue);
    if (plain !== null) return plain;

    const trimmed = rawValue.trim();
    const allowedPattern = /^[\d+\-*/().\s]+$/;
    if (!allowedPattern.test(trimmed)) {
        return null;
    }

    try {
        // eslint-disable-next-line no-new-func
        const computed = new Function(`"use strict"; return (${trimmed});`)();
        if (typeof computed === 'number' && Number.isFinite(computed)) {
            return computed;
        }
    } catch {
        return null;
    }

    return null;
}

/** Positive-int clamp with fallback (settings dimensions, fps). */
export function clampPositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}
