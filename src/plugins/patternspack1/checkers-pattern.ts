import { SceneElement, prop, insertElementGroups, Rectangle, ClipLayer, type RenderObject } from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class CheckersPatternElement extends SceneElement {
    constructor(id: string = 'checkers-pattern', config: Record<string, unknown> = {}) {
        super('checkers-pattern', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Checkers Pattern',
            description: 'A scrolling checkerboard background pattern',
            category: 'patternspack1',
        }, [
            {
                id: 'checkerAppearance',
                label: 'Appearance',
                variant: 'basic',
                collapsed: false,
                description: 'Checkerboard colors and square size',
                properties: [
                    prop.number('patternWidth', 'Width', 640, { min: 10, max: 4000, step: 1 }),
                    prop.number('patternHeight', 'Height', 360, { min: 10, max: 4000, step: 1 }),
                    prop.number('squareWidth', 'Square Width', 80, { min: 4, max: 400, step: 1 }),
                    prop.number('squareHeight', 'Square Height', 80, { min: 4, max: 400, step: 1 }),
                    prop.colorAlpha('color1', 'Color 1', '#222222FF'),
                    prop.colorAlpha('color2', 'Color 2', '#444444FF'),
                ],
                presets: [
                    { id: 'blackWhite', label: 'Black & White', values: { patternWidth: 640, patternHeight: 360, squareWidth: 80, squareHeight: 80, color1: '#000000FF', color2: '#FFFFFFFF' } },
                    { id: 'blueGold', label: 'Blue & Gold', values: { patternWidth: 640, patternHeight: 360, squareWidth: 60, squareHeight: 60, color1: '#1E3A8AFF', color2: '#F59E0BFF' } },
                ],
            },
            {
                id: 'checkerMotion',
                label: 'Motion',
                variant: 'basic',
                collapsed: false,
                description: 'Pan direction and speed',
                properties: [
                    prop.number('motionAngle', 'Motion Angle (deg)', 0, { min: 0, max: 360, step: 1, description: '0 = right, 90 = down' }),
                    prop.number('motionSpeed', 'Motion Speed (px/s)', 60, { min: 0, max: 2000, step: 1 }),
                ],
                presets: [],
            },
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const w: number = props.patternWidth;
        const h: number = props.patternHeight;
        const squareW: number = props.squareWidth;
        const squareH: number = props.squareHeight;
        const color1: string = props.color1;
        const color2: string = props.color2;
        const angleRad = (props.motionAngle * Math.PI) / 180;
        const speed: number = props.motionSpeed;

        // Layout anchor — invisible rectangle that defines the element's bounds
        const layoutRect = new Rectangle(0, 0, w, h, null, null, 0);
        layoutRect.setIncludeInLayoutBounds(true);

        // Pan offset at current time, wrapped to one 2-square period
        const dist = _targetTime * speed;
        const offsetX = Math.cos(angleRad) * dist;
        const offsetY = Math.sin(angleRad) * dist;
        const wrapX = ((offsetX % (squareW * 2)) + squareW * 2) % (squareW * 2);
        const wrapY = ((offsetY % (squareH * 2)) + squareH * 2) % (squareH * 2);

        // Tile grid — enough to cover the element plus one bleed period for wrap seam
        const cols = Math.ceil(w / squareW) + 3;
        const rows = Math.ceil(h / squareH) + 3;

        const clip = new ClipLayer(w, h);
        clip.setIncludeInLayoutBounds(false);

        for (let row = -1; row < rows; row++) {
            for (let col = -1; col < cols; col++) {
                const color = (row + col) % 2 !== 0 ? color2 : color1;
                if (!color || color.endsWith('00')) continue;

                const tile = new Rectangle(
                    col * squareW - wrapX,
                    row * squareH - wrapY,
                    squareW,
                    squareH,
                    color,
                    null,
                    0,
                    { includeInLayoutBounds: false }
                );
                clip.addChild(tile);
            }
        }

        return [layoutRect, clip];
    }
}
