import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text } from '@mvmnt-app/plugin-sdk/render';
export const textDisplay = definePluginElement({
    type: '{{ELEMENT_TYPE}}',
    metadata: { name: '{{ELEMENT_NAME}}', description: '{{ELEMENT_DESCRIPTION}}', category: 'Custom' },
    schema: {
        tabs: [
            tab.properties([
                group('text', 'Text', [
                    prop.string('textContent', 'Text', 'Hello World'),
                    prop.number('fontSize', 'Font Size', 36),
                    prop.color('textColor', 'Color', '#FFFFFF'),
                    prop.number('textOpacity', 'Text Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                    prop.boolean('showBackground', 'Show Background', false),
                    prop.color('backgroundColor', 'Background', '#000000'),
                    prop.number('backgroundOpacity', 'Background Opacity', 0.5, { min: 0, max: 1, step: 0.01 }),
                ]),
            ]),
        ],
    },
    render({ props }) {
        const width = props.textContent.length * props.fontSize * 0.6;
        const items = props.showBackground
            ? [
                  new Rectangle(-width / 2, -props.fontSize / 2, width, props.fontSize * 1.2, {
                      fillColor: props.backgroundColor,
                  }).setOpacity(props.backgroundOpacity),
              ]
            : [];
        return [
            ...items,
            new Text(0, 0, props.textContent, `${props.fontSize}px sans-serif`, {
                color: props.textColor,
                align: 'center',
                baseline: 'middle',
            }).setOpacity(props.textOpacity),
        ];
    },
});
