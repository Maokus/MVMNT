// Template: SDK 2 animated Sparrow atlas with bundled defaults.
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';

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
                        id: 'atlasSource',
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
                            { key: 'width', label: 'Display Width', type: 'number', default: 200, step: 10 },
                            { key: 'height', label: 'Display Height', type: 'number', default: 200, step: 10 },
                        ],
                    },
                ],
            },
        ],
    },
    createResources(context) {
        return {
            atlas: context.assets.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml'),
            background: context.assets.bundledImage('BOYFRIEND.png'),
            override: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bg: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bounds: new Rectangle(0, 0, 200, 200),
        };
    },
    render({ props, resources, time }) {
        resources.bounds.width = props.width;
        resources.bounds.height = props.height;
        const bg = resources.background.get();
        resources.bg
            .setResource(bg.resource as never, bg.status)
            .setLocalTime(0)
            .setDimensions(props.width, props.height)
            .setFitMode('contain');
        const atlas = props.atlas ? resources.override.update(props.atlas) : resources.atlas.get();
        resources.media
            .setResource(atlas.resource as never, atlas.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height)
            .setFitMode('contain');
        return [resources.bounds, resources.bg, resources.media];
    },
});
