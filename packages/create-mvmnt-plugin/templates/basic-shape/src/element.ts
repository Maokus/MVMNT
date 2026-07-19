import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Arc, Rectangle } from '@mvmnt-app/plugin-sdk/render';
export const basicShape = definePluginElement({
    type: 'basic-shape',
    metadata: { name: 'Basic Shape', description: 'A customizable geometric shape', category: 'Custom' },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'shapeAppearance',
                        label: 'Shape',
                        collapsed: false,
                        properties: [
                            {
                                key: 'shapeType',
                                label: 'Shape Type',
                                type: 'select',
                                default: 'circle',
                                options: [
                                    { label: 'Circle', value: 'circle' },
                                    { label: 'Rectangle', value: 'rectangle' },
                                ],
                            },
                            { key: 'shapeSize', label: 'Size', type: 'number', default: 100, min: 10, max: 500 },
                            { key: 'shapeColor', label: 'Color', type: 'colorAlpha', default: '#3B82F6FF' },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        return props.shapeType === 'circle'
            ? [
                  new Arc(0, 0, props.shapeSize, 0, Math.PI * 2, false, {
                      fillColor: props.shapeColor,
                      strokeColor: null,
                  }),
              ]
            : [
                  new Rectangle(-props.shapeSize / 2, -props.shapeSize / 2, props.shapeSize, props.shapeSize, {
                      fillColor: props.shapeColor,
                  }),
              ];
    },
});
