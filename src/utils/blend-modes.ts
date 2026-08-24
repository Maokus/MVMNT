export const BLEND_MODE_CHOICES = [
    { value: 'source-over', label: 'Normal' },
    { value: 'screen', label: 'Screen' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn', label: 'Color Burn' },
    { value: 'hard-light', label: 'Hard Light' },
    { value: 'soft-light', label: 'Soft Light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
] as const;

export type ElementOutputBlendMode = (typeof BLEND_MODE_CHOICES)[number]['value'];

const blendModes = new Set<string>(BLEND_MODE_CHOICES.map(({ value }) => value));

export function isElementOutputBlendMode(value: unknown): value is ElementOutputBlendMode {
    return typeof value === 'string' && blendModes.has(value);
}

export function normalizeElementOutputBlendMode(value: unknown): ElementOutputBlendMode {
    return isElementOutputBlendMode(value) ? value : 'source-over';
}
