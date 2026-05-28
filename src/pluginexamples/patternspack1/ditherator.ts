import { SceneElement, prop, insertElementConfig, tab, type RenderObject } from '@mvmnt/plugin-sdk';
import { Rectangle } from '@mvmnt/plugin-sdk/render';
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

function hash2(x: number, y: number): number {
    let h = Math.imul(x | 0, 1619) ^ Math.imul(y | 0, 31337);
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
}

function valueNoise2D(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
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
    let value = valueNoise2D(u * scale + evo, v * scale) * 0.5;
    value += valueNoise2D(u * scale * 2 + evo * 2, v * scale * 2) * 0.3;
    value += valueNoise2D(u * scale * 4 + evo * 4, v * scale * 4) * 0.2;
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
    return hash2(col * 2753, row * 4999);
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
                            prop.number('threshold', 'Threshold', 1.0, {
                                min: 0,
                                max: 2,
                                step: 0.01,
                                description:
                                    'Combined (texture + dither) must exceed this to show a cell. Lower = more cells.',
                            }),
                            prop.number('evolution', 'Evolution', 0, {
                                min: 0,
                                max: 100,
                                step: 0.01,
                                description: 'Drives animation within the texture (phase, z-offset, etc.).',
                            }),
                            prop.select('baseTexture', 'Base Texture', 'sine', [
                                { value: 'sine', label: 'Diagonal Sine' },
                                { value: 'radialSine', label: 'Radial Sine' },
                                { value: 'gradient', label: 'Horizontal Gradient' },
                                { value: 'perlin', label: 'Perlin Noise' },
                            ]),
                            prop.select('ditherPattern', 'Dither Pattern', 'bayer4', [
                                { value: 'bayer4', label: 'Bayer 4×4' },
                                { value: 'random', label: 'Random' },
                                { value: 'none', label: 'None' },
                            ]),
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

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const p = this.getSchemaProps();
        if (!p.visible) return [];

        const cols = Math.max(1, Math.round(p.cols as number));
        const rows = Math.max(1, Math.round(p.rows as number));
        const cellSize = Math.max(1, p.cellSize as number);
        const cellGap = Math.max(0, p.cellGap as number);
        const threshold = p.threshold as number;
        const evolution = (p.evolution as number) / 100;
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

        const drawSize = Math.max(1, cellSize - cellGap);
        const drawOffset = cellGap / 2;

        const objects: RenderObject[] = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const u = (col + 0.5) / cols;
                const v = (row + 0.5) / rows;
                const base = getBase(u, v, evolution);
                const dither = getDither(col, row);
                if (base + dither <= threshold) continue;
                objects.push(
                    new Rectangle(
                        ox + col * cellSize + drawOffset,
                        oy + row * cellSize + drawOffset,
                        drawSize,
                        drawSize,
                        cellColor
                    )
                );
            }
        }

        // Invisible layout sentinel so the element has correct bounds
        objects.push(new Rectangle(ox, oy, totalW, totalH, null, null, 0));

        return objects;
    }
}
