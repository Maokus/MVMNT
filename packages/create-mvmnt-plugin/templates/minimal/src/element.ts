import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
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
            tab.properties([
                group('appearance', 'Appearance', [
                    prop.colorAlpha('color', 'Color', '#3B82F6FF'),
                    prop.number('width', 'Width', 100, { min: 1 }),
                    prop.number('height', 'Height', 100, { min: 1 }),
                ]),
            ]),
        ],
    },
    render({ props }) {
        return [
            new Rectangle(-props.width / 2, -props.height / 2, props.width, props.height, {
                fillColor: props.color,
            }),
        ];
    },
});
