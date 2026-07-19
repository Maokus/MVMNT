import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
// Add assets/atlas.png and assets/atlas.xml before using this bundled-atlas template.
export const atlasImage = definePluginElement({
    type: 'atlas-image',
    metadata: {
        name: 'Atlas Image',
        description: 'Sparrow atlas animation with a bundled default',
        category: 'Custom',
    },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'atlas',
                        label: 'Atlas',
                        collapsed: false,
                        properties: [
                            {
                                key: 'atlas',
                                label: 'Override Atlas',
                                type: 'assetRef',
                                allowedAssetTypes: ['sparrow'],
                                default: null,
                            },
                            { key: 'width', label: 'Width', type: 'number', default: 200 },
                            { key: 'height', label: 'Height', type: 'number', default: 200 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    create(_props, context) {
        return {
            atlas: context.assets.bundledSparrow('atlas.png', 'atlas.xml'),
            override: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200),
        };
    },
    render(props, state, time) {
        const asset = props.atlas ? state.override.update(props.atlas) : state.atlas.get();
        state.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height);
        return [state.media];
    },
});
