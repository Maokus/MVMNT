import { SceneElement, prop, insertElementConfig, tab, type RenderObject } from '@mvmnt/plugin-sdk';
import { PixelGrid } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ── Bayer 4×4 ordered dither matrix, values normalised to [0, 1) ─────────────

const BAYER4: readonly (readonly number[])[] = [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

// ── Noise helpers ─────────────────────────────────────────────────────────────

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash3(x: number, y: number, z: number): number {
    let h = Math.imul(x | 0, 1619) ^ Math.imul(y | 0, 31337) ^ Math.imul(z | 0, 6791);
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
}

function valueNoise3D(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const zf = fade(z - zi);
    const a000 = hash3(xi, yi, zi);
    const a100 = hash3(xi + 1, yi, zi);
    const a010 = hash3(xi, yi + 1, zi);
    const a110 = hash3(xi + 1, yi + 1, zi);
    const a001 = hash3(xi, yi, zi + 1);
    const a101 = hash3(xi + 1, yi, zi + 1);
    const a011 = hash3(xi, yi + 1, zi + 1);
    const a111 = hash3(xi + 1, yi + 1, zi + 1);
    const x0 = a000 + (a100 - a000) * xf;
    const x1 = a010 + (a110 - a010) * xf;
    const x2 = a001 + (a101 - a001) * xf;
    const x3 = a011 + (a111 - a011) * xf;
    const y0 = x0 + (x1 - x0) * yf;
    const y1 = x2 + (x3 - x2) * yf;
    return y0 + (y1 - y0) * zf;
}

// ── Texture functions — (u, v, evolution) → [0, 1] ───────────────────────────

type TextureFn = (u: number, v: number, evolution: number) => number;

function sinTexture(u: number, v: number, evolution: number): number {
    return (Math.sin((u + v) * Math.PI * 6 + evolution * Math.PI * 2) + 1) / 2;
}

function radialSinTexture(u: number, v: number, evolution: number): number {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    return (Math.sin(r * Math.PI * 4 - evolution * Math.PI * 2) + 1) / 2;
}

function horizontalGradient(u: number, _v: number, _evolution: number): number {
    return u;
}

function perlinNoiseTexture(u: number, v: number, evolution: number): number {
    const scale = 4;
    const evo = evolution * 3;
    let value = valueNoise3D(u * scale, v * scale, evo) * 0.5;
    value += valueNoise3D(u * scale * 2, v * scale * 2, evo * 2) * 0.3;
    value += valueNoise3D(u * scale * 4, v * scale * 4, evo * 4) * 0.2;
    return Math.min(1, Math.max(0, value));
}

// ── Dither patterns — (col, row) → [0, 1] ────────────────────────────────────

type DitherFn = (col: number, row: number) => number;

function bayerDither(col: number, row: number): number {
    return BAYER4[row % 4][col % 4];
}

function noDither(_col: number, _row: number): number {
    return 0;
}

function randomDither(col: number, row: number): number {
    return hash3(col * 2753, row * 4999, 0);
}

// ── CSS #RRGGBBAA → [r, g, b, a] ─────────────────────────────────────────────

function parseHexRGBA(hex: string): [number, number, number, number] {
    const c = hex.replace('#', '');
    if (c.length === 8) {
        return [
            parseInt(c.slice(0, 2), 16),
            parseInt(c.slice(2, 4), 16),
            parseInt(c.slice(4, 6), 16),
            parseInt(c.slice(6, 8), 16),
        ];
    }
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16), 255];
}

// ─────────────────────────────────────────────────────────────────────────────

export class DitheratorElement extends SceneElement {
    constructor(id: string = 'ditherator', config: Record<string, unknown> = {}) {
        super('ditherator', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Ditherator',
                description: 'A dithered grid of squares driven by procedural texture functions.',
                category: 'us.maok.patternspack1',
            },
            [
                tab.properties([
                    {
                        id: 'grid',
                        label: 'Grid',
                        collapsed: false,
                        properties: [
                            prop.number('cols', 'Columns', 24, { min: 1, max: 200, step: 1 }),
                            prop.number('rows', 'Rows', 24, { min: 1, max: 200, step: 1 }),
                            prop.number('cellSize', 'Cell Size (px)', 20, { min: 1, max: 100, step: 1 }),
                            prop.number('cellGap', 'Cell Gap (px)', 0, { min: 0, max: 50, step: 1 }),
                        ],
                    },
                    {
                        id: 'visibility',
                        label: 'Visibility',
                        collapsed: false,
                        properties: [
                            prop.number('evolution', 'Evolution', 0, {
                                min: 0,
                                max: 100,
                                step: 0.01,
                                description: 'Drives animation by moving through the 3rd noise dimension.',
                            }),
                            prop.number('threshold', 'Threshold', 1.0, {
                                min: 0,
                                max: 2,
                                step: 0.01,
                                description:
                                    'Combined (texture + dither) must exceed this to show a cell. Lower = more cells.',
                            }),
                            prop.number('evolMotion', 'Evol Motion', 0, {
                                min: -10,
                                max: 10,
                                step: 0.001,
                                description: 'Adds currentTime × this value to Evolution, producing automatic drift.',
                            }),
                            prop.select('baseTexture', 'Base Texture', 'sine', [
                                { value: 'sine', label: 'Diagonal Sine' },
                                { value: 'radialSine', label: 'Radial Sine' },
                                { value: 'gradient', label: 'Horizontal Gradient' },
                                { value: 'perlin', label: 'Perlin Noise' },
                            ]),
                            prop.number('textureStrength', 'Texture Strength', 1, {
                                min: 0,
                                max: 4,
                                step: 0.01,
                                description: 'Multiplier applied to the base texture before threshold comparison.',
                            }),
                            prop.select('ditherPattern', 'Dither Pattern', 'bayer4', [
                                { value: 'bayer4', label: 'Bayer 4×4' },
                                { value: 'random', label: 'Random' },
                                { value: 'none', label: 'None' },
                            ]),
                            prop.number('textureStrength', 'Texture Strength', 1, {
                                min: 0,
                                max: 4,
                                step: 0.01,
                                description: 'Multiplier applied to the base texture before threshold comparison.',
                            }),
                        ],
                    },
                    {
                        id: 'transform',
                        label: 'Texture Transform',
                        collapsed: false,
                        properties: [
                            prop.number('texTranslateX', 'Translate X', 0, {
                                min: -10,
                                max: 10,
                                step: 0.01,
                                description: 'Offsets the texture UV horizontally.',
                            }),
                            prop.number('texTranslateY', 'Translate Y', 0, {
                                min: -10,
                                max: 10,
                                step: 0.01,
                                description: 'Offsets the texture UV vertically.',
                            }),
                            prop.number('texScale', 'Scale', 1, {
                                min: 0.01,
                                max: 20,
                                step: 0.01,
                                description: 'Scales the texture UV (zoom).',
                            }),
                        ],
                    },

                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [prop.colorAlpha('cellColor', 'Cell Color', '#FFFFFFFF')],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const cols = Math.max(1, Math.round(p.cols as number));
        const rows = Math.max(1, Math.round(p.rows as number));
        const cellSize = Math.max(1, p.cellSize as number);
        const cellGap = Math.max(0, p.cellGap as number);
        const threshold = p.threshold as number;
        const texTranslateX = p.texTranslateX as number;
        const texTranslateY = p.texTranslateY as number;
        const texScale = Math.max(0.001, p.texScale as number);
        const textureStrength = p.textureStrength as number;
        const bayerStrength = p.bayerStrength as number;
        const evolution = (p.evolution as number) / 100 + targetTime * (p.evolMotion as number);
        const cellColor = p.cellColor as string;
        const baseTextureName = p.baseTexture as string;
        const ditherPatternName = p.ditherPattern as string;

        const getBase: TextureFn =
            baseTextureName === 'gradient'
                ? horizontalGradient
                : baseTextureName === 'radialSine'
                  ? radialSinTexture
                  : baseTextureName === 'perlin'
                    ? perlinNoiseTexture
                    : sinTexture;

        const getDither: DitherFn =
            ditherPatternName === 'none' ? noDither : ditherPatternName === 'random' ? randomDither : bayerDither;

        const totalW = cols * cellSize;
        const totalH = rows * cellSize;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        const [r, g, b, a] = parseHexRGBA(cellColor);
        const pixels = new Uint8ClampedArray(cols * rows * 4);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const u = ((col + 0.5) / cols) * texScale + texTranslateX;
                const v = ((row + 0.5) / rows) * texScale + texTranslateY;
                const base = getBase(u, v, evolution);
                const dither = getDither(col, row);
                if (base * textureStrength + dither * bayerStrength <= threshold) continue;
                const idx = (row * cols + col) * 4;
                pixels[idx] = r;
                pixels[idx + 1] = g;
                pixels[idx + 2] = b;
                pixels[idx + 3] = a;
            }
        }

        return [new PixelGrid(ox, oy, cols, rows, cellSize, pixels, { cellGap })];
    }
}
