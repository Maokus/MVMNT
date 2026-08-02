import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';

interface BackgroundProps extends Readonly<Record<string, unknown>> {
    readonly color: string;
    readonly opacity: number;
}

export const background = definePluginElement<BackgroundProps, undefined>({
    type: 'background',
    metadata: { name: 'Background', description: 'Solid background color for the visualization', category: 'Misc' },
    schema: {
        defaultConfig: {},
        tabs: [
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'color', label: 'Color', type: 'colorAlpha', default: '#1a1a1a' },
                            {
                                key: 'opacity',
                                label: 'Opacity',
                                type: 'number',
                                default: 1,
                                min: 0,
                                max: 1,
                                step: 0.01,
                            },
                        ],
                        layout: [
                            { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
                            { kind: 'property', propertyKey: 'opacity' },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props, _state, time) {
        const viewport = time.viewport;
        if (!viewport) return [];
        return [
            new Rectangle(0, 0, viewport.width, viewport.height, {
                fillColor: applyOpacity(props.color, props.opacity),
            }),
        ];
    },
});

export const BackgroundElement = createBuiltInDefinitionElementClass(background);
