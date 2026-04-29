// Template: Minimal Element
// The simplest possible scene element — a good starting point for anything custom.
// Renders a single colored rectangle. Replace the rendering logic with your own.
import { SceneElement, prop, insertElementGroups, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class MinimalElement extends SceneElement {
    constructor(id: string = 'myElement', config: Record<string, unknown> = {}) {
        super('my-element', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'My Element',
                description: 'A minimal scene element',
                category: 'Custom',
            },
            [
                {
                    id: 'appearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        prop.colorAlpha('color', 'Color', '#3B82F6FF'),
                        prop.number('size', 'Size', 100, { min: 10, max: 500, step: 1 }),
                    ],
                },
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const half = (props.size as number) / 2;
        return [new Rectangle(-half, -half, props.size, props.size, props.color)];
    }
}
