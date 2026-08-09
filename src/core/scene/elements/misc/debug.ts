import { Rectangle, Text } from '@core/render/render-objects';
import { createBuiltInDefinitionElementClass, defineBuiltInElement } from '@core/scene/plugins/built-in-definition';

interface Props extends Readonly<Record<string, unknown>> {
    readonly showDots: boolean;
    readonly imageSource: string | null;
}
export const debug = defineBuiltInElement<Props, undefined>({
    type: 'debug',
    metadata: { name: 'Debug', description: 'Debugging information display', category: 'Misc' },
    schema: {
        defaultConfig: {},
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'debugSettings',
                        label: 'Debug Tools',
                        collapsed: false,
                        properties: [
                            { key: 'showDots', label: 'Show Alignment Dots', type: 'boolean', default: true },
                            {
                                key: 'imageSource',
                                label: 'Image input',
                                type: 'assetRef',
                                allowedAssetTypes: ['image', 'gif'],
                                default: null,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
        const objects = props.showDots
            ? colors.map((color, index) => new Rectangle(index * 50, index * 50, 50, 50, { fillColor: color }))
            : [];
        return [...objects, new Text(0, 0, String(props.imageSource), '16px Arial')];
    },
});
export const DebugElement = createBuiltInDefinitionElementClass(debug);
