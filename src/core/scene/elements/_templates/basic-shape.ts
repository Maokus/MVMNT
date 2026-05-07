// Template: Basic Shape Element
// A simple geometric shape that can be customized with color and size
import { SceneElement, prop, insertElementGroups, tab, Rectangle, Arc, type RenderObject } from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class BasicShapeElement extends SceneElement {
    constructor(id: string = 'basicShape', config: Record<string, unknown> = {}) {
        super('basic-shape', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Basic Shape',
                description: 'A customizable geometric shape',
                category: 'Custom',
            },
            [
                tab.properties([
                    {
                        id: 'shapeAppearance',
                        label: 'Shape',
                        variant: 'basic',
                        collapsed: false,
                        description: 'Configure the shape appearance',
                        properties: [
                            prop.select('shapeType', 'Shape Type', 'circle', [
                                { label: 'Circle', value: 'circle' },
                                { label: 'Rectangle', value: 'rectangle' },
                            ]),
                            prop.number('shapeSize', 'Size', 100, {
                                min: 10,
                                max: 500,
                                step: 1,
                                description: 'Size of the shape (radius for circle, width/height for rectangle)',
                            }),
                            prop.colorAlpha('shapeColor', 'Color', '#3B82F6FF', {
                                description: 'Fill color of the shape',
                            }),
                        ],
                        presets: [
                            {
                                id: 'smallBlue',
                                label: 'Small Blue',
                                values: { shapeType: 'circle', shapeSize: 50, shapeColor: '#3B82F6FF' },
                            },
                            {
                                id: 'largeRed',
                                label: 'Large Red',
                                values: { shapeType: 'rectangle', shapeSize: 150, shapeColor: '#EF4444FF' },
                            },
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (props.shapeType === 'circle') {
            // Use Arc to draw a circle (full 360 degrees)
            objects.push(new Arc(0, 0, props.shapeSize, 0, Math.PI * 2));
        } else {
            objects.push(
                new Rectangle(
                    -props.shapeSize / 2,
                    -props.shapeSize / 2,
                    props.shapeSize,
                    props.shapeSize,
                    props.shapeColor
                )
            );
        }

        return objects;
    }
}
