// Template: SDK 2 basic shape element.
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Arc, Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const basicShape = definePluginElement({
    type: 'basic-shape',
    metadata: { name: 'Basic Shape', description: 'A customizable geometric shape', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [{
        id: 'shapeAppearance', label: 'Shape', collapsed: false,
        properties: [
            { key: 'shapeType', label: 'Shape Type', type: 'select', default: 'circle', options: [
                { label: 'Circle', value: 'circle' }, { label: 'Rectangle', value: 'rectangle' },
            ] },
            { key: 'shapeSize', label: 'Size', type: 'number', default: 100, min: 10, max: 500, step: 1 },
            { key: 'shapeColor', label: 'Color', type: 'colorAlpha', default: '#3B82F6FF' },
        ],
        presets: [
            { id: 'smallBlue', label: 'Small Blue', values: { shapeType: 'circle', shapeSize: 50, shapeColor: '#3B82F6FF' } },
            { id: 'largeRed', label: 'Large Red', values: { shapeType: 'rectangle', shapeSize: 150, shapeColor: '#EF4444FF' } },
        ],
    }] }] },
    capabilities: { required: [], optional: [] },
    render(props) {
        if (props.shapeType === 'circle') {
            return [new Arc(0, 0, props.shapeSize, {
                startAngle: 0,
                endAngle: Math.PI * 2,
                fillColor: props.shapeColor,
                strokeColor: null,
            })];
        }
        return [new Rectangle(-props.shapeSize / 2, -props.shapeSize / 2, props.shapeSize, props.shapeSize, {
            fillColor: props.shapeColor,
        })];
    },
});
