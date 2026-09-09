import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Arc, Rectangle } from '@mvmnt-app/plugin-sdk/render';
export const basicShape = definePluginElement({
    type: 'basic-shape',
    metadata: { name: 'Basic Shape', description: 'A customizable geometric shape', category: 'Custom' },
    schema: {
        tabs: [
            tab.properties([
                group('shapeAppearance', 'Shape', [
                    prop.select('shapeType', 'Shape Type', 'circle', [
                        { label: 'Circle', value: 'circle' },
                        { label: 'Rectangle', value: 'rectangle' },
                    ]),
                    prop.number('shapeSize', 'Size', 100, { min: 10, max: 500 }),
                    prop.colorAlpha('shapeColor', 'Color', '#3B82F6FF'),
                ]),
            ]),
        ],
    },
    render({ props }) {
        return props.shapeType === 'circle'
            ? [
                  new Arc(0, 0, props.shapeSize, {
                      startAngle: 0,
                      endAngle: Math.PI * 2,
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
