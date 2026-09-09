// Template: SDK 2 bundled image/GIF with an optional project override.
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';

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
                        id: 'imageSource',
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
                            { key: 'width', label: 'Width', type: 'number', default: 200, step: 10 },
                            { key: 'height', label: 'Height', type: 'number', default: 200, step: 10 },
                            {
                                key: 'fitMode',
                                label: 'Fit Mode',
                                type: 'select',
                                default: 'contain',
                                options: [
                                    { value: 'contain', label: 'Contain' },
                                    { value: 'cover', label: 'Cover' },
                                    { value: 'fill', label: 'Fill' },
                                    { value: 'clip', label: 'Clip (native size)' },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    createResources(context) {
        return {
            bundled: context.assets.bundledImage('cooltext491233707844001.gif'),
            override: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bounds: new Rectangle(0, 0, 200, 200),
        };
    },
    render({ props, resources, time }) {
        resources.bounds.width = props.width;
        resources.bounds.height = props.height;
        const asset = props.imageSource ? resources.override.update(props.imageSource) : resources.bundled.get();
        resources.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode);
        return [resources.bounds, resources.media];
    },
});
