// Template: Basic Shape Element
// A simple geometric shape that can be customized with color and size
import { SceneElement, asNumber, asTrimmedString } from '@core/scene/elements/base';
import { Rectangle, Arc, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';

export class BasicShapeElement extends SceneElement {
    constructor(id: string = 'basicShape', config: Record<string, unknown> = {}) {
        super('basic-shape', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        
        return {
            ...base,
            name: 'Basic Shape',
            description: 'A customizable geometric shape',
            category: 'Custom',
            groups: [
                ...basicGroups,
                {
                    id: 'shapeAppearance',
                    label: 'Shape',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Configure the shape appearance',
                    properties: [
                        {
                            key: 'shapeType',
                            type: 'select',
                            label: 'Shape Type',
                            default: 'circle',
                            options: [
                                { label: 'Circle', value: 'circle' },
                                { label: 'Rectangle', value: 'rectangle' },
                            ],
                            runtime: {
                                transform: (value, element) => {
                                    const normalized = asTrimmedString(value, element)?.toLowerCase();
                                    return normalized === 'rectangle' ? 'rectangle' : 'circle';
                                },
                                defaultValue: 'circle'
                            },
                        },
                        {
                            key: 'shapeSize',
                            type: 'number',
                            label: 'Size',
                            default: 100,
                            min: 10,
                            max: 500,
                            step: 1,
                            description: 'Size of the shape (radius for circle, width/height for rectangle)',
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'shapeColor',
                            type: 'colorAlpha',
                            label: 'Color',
                            default: '#3B82F6FF',
                            description: 'Fill color of the shape',
                            runtime: { transform: asTrimmedString, defaultValue: '#3B82F6FF' },
                        },
                    ],
                    presets: [
                        {
                            id: 'smallBlue',
                            label: 'Small Blue',
                            values: { shapeType: 'circle', shapeSize: 50, shapeColor: '#3B82F6FF' }
                        },
                        {
                            id: 'largeRed',
                            label: 'Large Red',
                            values: { shapeType: 'rectangle', shapeSize: 150, shapeColor: '#EF4444FF' }
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        
        if (!props.visible) return [];
        
        const objects: RenderObject[] = [];
        
        if (props.shapeType === 'circle') {
            // Use Arc to draw a circle (full 360 degrees)
            objects.push(new Arc(0, 0, props.shapeSize, 0, Math.PI * 2, props.shapeColor));
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
