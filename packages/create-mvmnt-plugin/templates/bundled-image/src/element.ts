import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
// Add assets/image.gif before using this bundled-media template.
export const bundledImage = definePluginElement({
    type: 'bundled-image',
    metadata: {
        name: 'Bundled Image',
        description: 'Displays a bundled image with optional user override',
        category: 'Custom',
    },
    schema: {
        tabs: [
            {
                id: 'properties',
                label: 'Properties',
                groups: [
                    {
                        id: 'image',
                        label: 'Image',
                        collapsed: false,
                        properties: [
                            {
                                key: 'imageSource',
                                label: 'Override Image',
                                type: 'assetRef',
                                allowedAssetTypes: ['image', 'gif'],
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
            bundled: context.assets.bundledImage('image.gif'),
            override: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200),
        };
    },
    render(props, state, time) {
        const asset = props.imageSource ? state.override.update(props.imageSource) : state.bundled.get();
        state.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height);
        return [state.media];
    },
});
