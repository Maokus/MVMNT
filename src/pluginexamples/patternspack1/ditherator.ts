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

// ── Texture functions — return a value in [0, 1] for UV coordinates ──────────

function sinTexture(u: number, v: number): number {
    return (Math.sin((u + v) * Math.PI * 6) + 1) / 2;
}

function radialSinTexture(u: number, v: number): number {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    return (Math.sin(r * Math.PI * 4) + 1) / 2;
}

function horizontalGradient(u: number, _v: number): number {
    return u;
}

// ── Dither patterns ───────────────────────────────────────────────────────────

function bayerDither(col: number, row: number): number {
    return BAYER4[row % 4][col % 4];
}

function noDither(_col: number, _row: number): number {
    return 0;
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
                            prop.select('baseTexture', 'Base Texture', 'sine', [
                                { value: 'sine', label: 'Diagonal Sine' },
                                { value: 'radialSine', label: 'Radial Sine' },
                                { value: 'gradient', label: 'Horizontal Gradient' },
                            ]),
                            prop.select('ditherPattern', 'Dither Pattern', 'bayer4', [
                                { value: 'bayer4', label: 'Bayer 4×4' },
                                { value: 'none', label: 'None' },
                            ]),
                        ],
                    },
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [prop.colorAlpha('color', 'Cell Color', '#FFFFFFFF')],
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
        const threshold = p.threshold as number;
        const color = p.color as string;
        const baseTextureName = p.baseTexture as string;
        const ditherPatternName = p.ditherPattern as string;

        const getBase =
            baseTextureName === 'gradient'
                ? horizontalGradient
                : baseTextureName === 'radialSine'
                  ? radialSinTexture
                  : sinTexture;

        const getDither = ditherPatternName === 'none' ? noDither : bayerDither;

        const totalW = cols * cellSize;
        const totalH = rows * cellSize;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        const objects: RenderObject[] = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const u = (col + 0.5) / cols;
                const v = (row + 0.5) / rows;
                const base = getBase(u, v);
                const dither = getDither(col, row);
                if (base + dither <= threshold) continue;
                objects.push(new Rectangle(ox + col * cellSize, oy + row * cellSize, cellSize, cellSize, color));
            }
        }

        // Invisible layout sentinel so the element has correct bounds
        objects.push(new Rectangle(ox, oy, totalW, totalH, null, null, 0));

        return objects;
    }
}
