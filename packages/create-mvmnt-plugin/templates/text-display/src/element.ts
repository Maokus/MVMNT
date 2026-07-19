import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text } from '@mvmnt-app/plugin-sdk/render';
export const textDisplay = definePluginElement({
    type: 'text-display',
    metadata: { name: 'Text Display', description: 'Display customizable text', category: 'Custom' },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'text',
                        label: 'Text',
                        collapsed: false,
                        properties: [
                            { key: 'textContent', label: 'Text', type: 'string', default: 'Hello World' },
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 36 },
                            { key: 'textColor', label: 'Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            { key: 'showBackground', label: 'Show Background', type: 'boolean', default: false },
                            { key: 'backgroundColor', label: 'Background', type: 'colorAlpha', default: '#00000080' },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        const width = props.textContent.length * props.fontSize * 0.6;
        const items = props.showBackground
            ? [
                  new Rectangle(-width / 2, -props.fontSize / 2, width, props.fontSize * 1.2, {
                      fillColor: props.backgroundColor,
                  }),
              ]
            : [];
        return [
            ...items,
            new Text(0, 0, props.textContent, `${props.fontSize}px sans-serif`, {
                color: props.textColor,
                align: 'center',
                baseline: 'middle',
            }),
        ];
    },
});
