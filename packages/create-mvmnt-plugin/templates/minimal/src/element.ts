import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const element = definePluginElement({
    type: '{{ELEMENT_TYPE}}',
    metadata: {
        name: '{{ELEMENT_NAME}}',
        description: '{{ELEMENT_DESCRIPTION}}',
        category: 'Custom',
    },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'color', label: 'Color', type: 'colorAlpha', default: '#3B82F6FF' },
                            { key: 'width', label: 'Width', type: 'number', default: 100, min: 1 },
                            { key: 'height', label: 'Height', type: 'number', default: 100, min: 1 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        return [
            new Rectangle(-props.width / 2, -props.height / 2, props.width, props.height, {
                fillColor: props.color,
            }),
        ];
    },
});
