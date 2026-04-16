import { SceneElement, prop, insertElementGroups, Rectangle, Arc, type RenderObject } from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

function seededRandom(seed: number): number {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
}

/** Modulo that always returns a non-negative result */
function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

export class ParticlesPatternElement extends SceneElement {
    constructor(id: string = 'particles-pattern', config: Record<string, unknown> = {}) {
        super('particles-pattern', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Particles Pattern',
            description: 'Floating circles with configurable gravity and direction.',
            category: 'patternspack1',
        }, [
            {
                id: 'particlesBounds',
                label: 'Bounds',
                variant: 'basic',
                collapsed: false,
                description: 'Element dimensions.',
                properties: [
                    prop.number('elementWidth', 'Width', 1000, { min: 10, max: 4000, step: 1 }),
                    prop.number('elementHeight', 'Height', 1000, { min: 10, max: 4000, step: 1 }),
                ],
                presets: [],
            },
            {
                id: 'particlesGravity',
                label: 'Gravity',
                variant: 'basic',
                collapsed: false,
                description: 'Controls movement speed and direction.',
                properties: [
                    prop.number('gravity', 'Gravity', 80, {
                        min: 0, max: 2000, step: 1,
                        description: 'Particle speed in pixels per second.',
                    }),
                    prop.number('gravityDirection', 'Direction (°)', 90, {
                        min: 0, max: 360, step: 1,
                        description: '0 = right, 90 = down, 180 = left, 270 = up.',
                    }),
                ],
                presets: [
                    { id: 'falling', label: 'Falling', values: { gravity: 80, gravityDirection: 90 } },
                    { id: 'rising', label: 'Rising', values: { gravity: 60, gravityDirection: 270 } },
                    { id: 'sideways', label: 'Sideways', values: { gravity: 100, gravityDirection: 0 } },
                ],
            },
            {
                id: 'particlesAppearance',
                label: 'Particles',
                variant: 'basic',
                collapsed: false,
                description: 'Particle appearance settings.',
                properties: [
                    prop.number('particleCount', 'Count', 40, { min: 1, max: 500, step: 1 }),
                    prop.number('particleSize', 'Size', 3, {
                        min: 1, max: 300, step: 1,
                        description: 'Max particle radius in pixels.',
                    }),
                    prop.number('particleOpacity', 'Opacity', 0.7, { min: 0, max: 1, step: 0.01 }),
                    prop.colorAlpha('particleColor', 'Color', '#FFFFFFFF', { description: 'Particle fill color.' }),
                ],
                presets: [
                    { id: 'snowflakes', label: 'Snowflakes', values: { particleCount: 60, particleSize: 8, particleOpacity: 0.85, particleColor: '#FFFFFFFF' } },
                    { id: 'embers', label: 'Embers', values: { particleCount: 30, particleSize: 5, particleOpacity: 0.9, particleColor: '#FF6600FF' } },
                    { id: 'bubbles', label: 'Bubbles', values: { particleCount: 25, particleSize: 20, particleOpacity: 0.4, particleColor: '#88CCFFFF' } },
                ],
            },
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const w: number = props.elementWidth;
        const h: number = props.elementHeight;
        const count: number = props.particleCount;
        const maxRadius: number = props.particleSize;
        const baseOpacity: number = props.particleOpacity;
        const gravity: number = props.gravity;
        const directionDeg: number = props.gravityDirection;

        const angleRad = (directionDeg * Math.PI) / 180;
        const vxBase = Math.cos(angleRad) * gravity; // px/sec at speed multiplier 1
        const vyBase = Math.sin(angleRad) * gravity;

        // Strip alpha channel from colorAlpha string (format #RRGGBBAA → #RRGGBB)
        const color: string = props.particleColor;
        const hexColor = color.length === 9 ? color.slice(0, 7) : color;

        // Invisible bounds rectangle — defines layout footprint, not rendered
        const objects: RenderObject[] = [
            new Rectangle(-w / 2, -h / 2, w, h, null, null, 1),
        ];

        for (let i = 0; i < count; i++) {
            const s = i * 6;
            const r0 = seededRandom(s);     // initial x fraction [0,1)
            const r1 = seededRandom(s + 1); // initial y fraction [0,1)
            const r2 = seededRandom(s + 2); // size variation [0,1)
            const r3 = seededRandom(s + 3); // speed variation [0,1)
            const r4 = seededRandom(s + 4); // opacity variation [0,1)
            const r5 = seededRandom(s + 5); // time phase offset [0,1)

            const radius = maxRadius * (0.3 + r2 * 0.7);
            const speedMul = 0.5 + r3 * 1.0; // 0.5× to 1.5× base speed
            const opacity = baseOpacity * (0.4 + r4 * 0.6);

            // Phase offset: stagger initial positions so particles fill the bounds evenly
            // by offsetting their apparent start time
            const phaseX = r5 * w;
            const phaseY = r5 * h;

            // Wrap position within bounds
            const px = vxBase !== 0
                ? mod(r0 * w + phaseX + vxBase * speedMul * targetTime, w)
                : r0 * w;
            const py = vyBase !== 0
                ? mod(r1 * h + phaseY + vyBase * speedMul * targetTime, h)
                : r1 * h;

            const arc = new Arc(
                -w / 2 + px,
                -h / 2 + py,
                radius,
                0, Math.PI * 2,
                false,
                { fillColor: hexColor, strokeColor: null, includeInLayoutBounds: false }
            );
            arc.opacity = opacity;
            objects.push(arc);
        }

        return objects;
    }
}
